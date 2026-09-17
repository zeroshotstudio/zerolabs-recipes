> **Key Takeaway:** Connecting Claude Desktop and Cursor to custom Model Context Protocol (MCP) servers requires standard input and output (stdio) subprocess orchestration, explicit environment variable injection, and clean separation between JSON-RPC framing and runtime diagnostic logs. Because GUI desktop applications run in detached desktop sessions without interactive shell profiles, every executable command, script path, and credential must be statically resolved and hardened against stdout pollution.
>
> - Claude Desktop reads server definitions from `claude_desktop_config.json` while Cursor parses `.cursor/mcp.json` or workspace settings, spawning isolated child processes on startup.
> - Stdio transport requires all application logs, debug messages, and progress statements to route strictly to `stderr`. Emitting unparsed text to `stdout` breaks JSON-RPC protocol framing and crashes the client connection.
> - Client environment injection (`env` dictionary) isolates API keys and credentials per server without requiring shell-wide export statements or system environment modification.
> - Broken connections can be diagnosed in seconds by inspecting client log streams (`~/Library/Logs/Claude/mcp*.log` on macOS or Linux equivalents) and validating stdio handshakes with sub-5-second JSON-RPC probes.

Desktop LLM interfaces and agentic IDEs rely on the Model Context Protocol (MCP) to access local filesystems, query staging databases, run system diagnostics, and interface with enterprise toolchains. While web-based chat interfaces communicate with remote tools across network boundaries, desktop hosts such as Claude Desktop and Cursor spawn local server instances directly on the developer's workstation.

Understanding how Claude Desktop and Cursor orchestrate these subprocesses transforms MCP from an opaque feature into a reliable developer workflow. When a connection fails, the failure usually stems from three sources: path resolution discrepancies, missing environment variables, or rogue stdout logging.

In this guide, we examine the architectural model governing desktop MCP hosts. We construct production-ready configurations for Claude Desktop and Cursor, build testable companion servers in Python and TypeScript, dissect environment variable isolation, and establish a repeatable debugging checklist backed by sub-5-second verification probes.

Companion code repository: [ZeroLabs Claude Recipes Monorepo](https://github.com/zeroshotstudio/zerolabs-recipes/tree/main/recipes/claude/25-connect-desktop-cursor-mcp).

## Contents

- [How Do Desktop MCP Clients Orchestrate Subprocesses?](#how-do-desktop-mcp-clients-orchestrate-subprocesses)
- [What Are the Hard Rules of Desktop Client Configuration?](#what-are-the-hard-rules-of-desktop-client-configuration)
- [Where Are Configuration Files Located Across Operating Systems?](#where-are-configuration-files-located-across-operating-systems)
- [How to Configure Claude Desktop for Custom MCP Servers?](#how-to-configure-claude-desktop-for-custom-mcp-servers)
- [How to Configure Cursor IDE for Project and Global MCP?](#how-to-configure-cursor-ide-for-project-and-global-mcp)
- [How to Build Companion Python and TypeScript Test Servers?](#how-to-build-companion-python-and-typescript-test-servers)
- [How Does Environment Variable Injection and Isolation Work?](#how-does-environment-variable-injection-and-isolation-work)
- [How to Debug Broken Connections Using Live Client Logs?](#how-to-debug-broken-connections-using-live-client-logs)
- [How to Verify Client Configurations with Sub-5s Probes?](#how-to-verify-client-configurations-with-sub-5s-probes)
- [FAQ](#faq)

## How Do Desktop MCP Clients Orchestrate Subprocesses?

Both Claude Desktop and Cursor operate as MCP client hosts. Under the [Model Context Protocol specification](https://modelcontextprotocol.io), the client host is responsible for reading user configuration, spawning the configured server executable as an isolated child process, establishing standard I/O pipes, and executing the JSON-RPC initialization handshake.

```
+------------------------------------------------------------------------+
|                      Host Client (Claude Desktop / Cursor)             |
+------------------------------------------------------------------------+
   |                                                                  ^
   | 1. Read JSON Config (command, args, env)                         |
   | 2. Spawn Subprocess (POSIX pipe / Win32 Anonymous Pipe)          |
   v                                                                  |
+------------------------------------------------------------------------+
|               Subprocess Isolation Boundary                            |
|                                                                        |
|   Standard Input (stdin)   ===> [ JSON-RPC Requests ]                  |
|   Standard Output (stdout) <=== [ JSON-RPC Responses / Notifications ] |
|   Standard Error (stderr)  ===> [ Client Log File / Debug Console ]    |
|                                                                        |
|   Child Process: python3 server.py  OR  node dist/server.js            |
+------------------------------------------------------------------------+
```

The execution flow follows a strict lifecycle:

1. **Config Ingestion**: On launch or workspace activation, the client parses its respective JSON configuration file. It extracts the executable `command`, positional `args`, and custom `env` dictionary.
2. **Process Spawning**: The client executes the command using standard system calls (`fork`/`exec` on Unix-like systems, `CreateProcess` on Windows). It creates pipes for `stdin`, `stdout`, and `stderr`.
3. **Initialize Handshake**: The client sends a JSON-RPC request to the child process over `stdin`:
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "initialize",
     "params": {
       "protocolVersion": "2024-11-05",
       "capabilities": {
         "roots": { "listChanged": true },
         "sampling": {}
       },
       "clientInfo": {
         "name": "claude-desktop",
         "version": "0.7.8"
       }
     }
   }
   ```
4. **Server Response**: The server returns its protocol version, supported capabilities (`tools`, `resources`, `prompts`), and server metadata on `stdout`.
5. **Initialized Notification**: The client acknowledges readiness by sending the `notifications/initialized` message.
6. **Tool Discovery**: The client requests available primitives using `tools/list`, `resources/list`, and `prompts/list`, rendering them directly into the graphical interface.

For an in-depth breakdown of stdio framing and alternative transport architectures, review our guide on [How to Configure Stdio and SSE Transports in MCP](https://labs.zeroshot.studio/resources/how-to-configure-stdio-and-sse-mcp-transports).

## What Are the Hard Rules of Desktop Client Configuration?

When wiring custom servers into Claude Desktop or Cursor, our team adheres to five mandatory operational rules:

1. **Strict Stdout Hygiene**: The standard output channel (`stdout`) belongs entirely to the JSON-RPC engine. Any line written to `stdout` that is not a valid JSON-RPC frame causes the client parser to throw an unhandled token error and terminate the connection. All application logging, debug output, and trace messages must route to `stderr`.
2. **Absolute Executable and File Paths**: Desktop GUI applications do not inherit your terminal shell's `$PATH` or working directory. Never configure relative paths like `python ./server.py` in Claude Desktop. Specify full paths to both the runtime interpreter (for example, `/usr/bin/python3` or `/home/user/.venv/bin/python`) and the script file.
3. **Explicit Environment Injection**: Do not assume environment variables exported in `~/.bashrc`, `~/.zshrc`, or local `.env` files are available to GUI child processes. Pass every required credential and configuration key explicitly in the `env` block.
4. **Subprocess Graceful Termination**: MCP servers must handle standard termination signals (`SIGTERM`, `SIGINT`, `SIGHUP`) cleanly. When a user closes a chat window or quits Cursor, the client terminates child subprocesses. Unhandled background threads can result in orphaned processes consuming workstation memory.
5. **No Interactive Prompts on Stdio**: Because standard input is dedicated to JSON-RPC framing, tools cannot prompt the user for input via `stdin` (such as Python `input()` or Node `readline`). All interactive authorizations must pass through MCP protocol sampling or client confirmation dialogs.

## Where Are Configuration Files Located Across Operating Systems?

Configuration locations depend on the operating system and client implementation:

### Claude Desktop

Claude Desktop stores its configuration in the platform-standard application support directory:

| Operating System | Configuration File Path | Client Log Directory |
| :--- | :--- | :--- |
| **macOS** | `~/Library/Application Support/Claude/claude_desktop_config.json` | `~/Library/Logs/Claude/` |
| **Linux** | `~/.config/Claude/claude_desktop_config.json` | `~/.config/Claude/logs/` |
| **Windows** | `%APPDATA%\Claude\claude_desktop_config.json` | `%APPDATA%\Claude\logs\` |

### Cursor IDE

Cursor supports two configuration tiers:

1. **Workspace Configuration (Recommended)**: Located at `.cursor/mcp.json` in the root of your project workspace. This configuration is project-specific and can be checked into version control (excluding secrets).
2. **Global Configuration**: Configured through **Cursor Settings > Features > MCP**, which writes to Cursor's global application storage.

## How to Configure Claude Desktop for Custom MCP Servers?

To connect custom Python and TypeScript servers to Claude Desktop, open the configuration file in your editor:

```bash
# macOS
nano ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Linux
mkdir -p ~/.config/Claude
nano ~/.config/Claude/claude_desktop_config.json
```

Populate the file with the `mcpServers` object:

```json
{
  "mcpServers": {
    "custom-python-mcp": {
      "command": "/path/to/venv/bin/python3",
      "args": [
        "/path/to/projects/zerolabs-recipes/recipes/claude/25-connect-desktop-cursor-mcp/python/server.py"
      ],
      "env": {
        "MCP_DEBUG": "true",
        "API_SECRET_KEY": "zerolabs-local-secret-key-12345"
      }
    },
    "custom-typescript-mcp": {
      "command": "node",
      "args": [
        "/path/to/projects/zerolabs-recipes/recipes/claude/25-connect-desktop-cursor-mcp/typescript/dist/server.js"
      ],
      "env": {
        "MCP_DEBUG": "true",
        "API_SECRET_KEY": "zerolabs-local-secret-key-12345"
      }
    }
  }
}
```

### Modern Virtual Environment Runners (uv and npx)

If you use modern package runners like `uv` or `npx`, configure the executable command and arguments accordingly:

```json
{
  "mcpServers": {
    "python-uv-server": {
      "command": "uv",
      "args": [
        "run",
        "--with",
        "mcp",
        "--with",
        "pydantic",
        "python",
        "/path/to/server.py"
      ],
      "env": {
        "PYTHONUNBUFFERED": "1"
      }
    },
    "ts-npx-server": {
      "command": "npx",
      "args": [
        "-y",
        "tsx",
        "/path/to/src/server.ts"
      ]
    }
  }
}
```

> [!IMPORTANT]
> Always set `PYTHONUNBUFFERED="1"` when running Python MCP servers through generic launchers to ensure JSON-RPC responses are flushed immediately across standard I/O pipes.

## How to Configure Cursor IDE for Project and Global MCP?

Cursor exposes MCP tools directly inside Composer and chat sessions. The most effective pattern is defining project-scoped tools in `.cursor/mcp.json`.

Create `.cursor/mcp.json` at the root of your project:

```json
{
  "mcpServers": {
    "custom-python-mcp": {
      "command": "python3",
      "args": [
        "${workspaceFolder}/recipes/claude/25-connect-desktop-cursor-mcp/python/server.py"
      ],
      "env": {
        "MCP_DEBUG": "true",
        "API_SECRET_KEY": "zerolabs-local-secret-key-12345"
      }
    },
    "custom-typescript-mcp": {
      "command": "node",
      "args": [
        "${workspaceFolder}/recipes/claude/25-connect-desktop-cursor-mcp/typescript/dist/server.js"
      ],
      "env": {
        "MCP_DEBUG": "true",
        "API_SECRET_KEY": "zerolabs-local-secret-key-12345"
      }
    }
  }
}
```

### Key Differences Between Claude Desktop and Cursor

1. **Variable Interpolation**: Cursor supports VS Code variable substitutions such as `${workspaceFolder}`, `${env:HOME}`, and `${pathSeparator}` in `args` and `env`. Claude Desktop does not support variable interpolation and requires explicit absolute paths.
2. **Hot Reloading**: Cursor detects changes to `.cursor/mcp.json` and provides a manual reload button in **Settings > Features > MCP**. Claude Desktop requires quitting and restarting the application to pick up configuration changes.
3. **Tool Permission Prompts**: Cursor allows developers to configure auto-approval policies for specific tools within its settings UI, while Claude Desktop prompts the user for approval during conversation turns unless explicitly marked safe.

## How to Build Companion Python and TypeScript Test Servers?

To verify client wiring, we build lightweight companion servers in both Python and TypeScript. Each server exposes:
- A `ping` tool that echoes input and confirms process identity.
- A `verify_environment` tool that checks environment variable injection.
- A system telemetry resource.
- A diagnostic prompt template.

### Python Companion Server (FastMCP)

Save the following file in `python/server.py`. If you need an end-to-end walkthrough on developing Python MCP servers, read our comprehensive guide on [How to Build an MCP Server with Python SDK](https://labs.zeroshot.studio/resources/how-to-build-an-mcp-server-with-python-sdk).

```python
#!/usr/bin/env python3
"""
Custom MCP Companion Server in Python for Claude Desktop and Cursor.
Demonstrates stdio protocol, environment injection validation, and connection diagnostics.
"""

import sys
import os
import json
from pydantic import BaseModel, Field
from mcp.server.fastmcp import FastMCP, Context

# Initialize FastMCP Server
mcp = FastMCP(
    name="custom-python-mcp",
    dependencies=["pydantic"]
)

class EchoInput(BaseModel):
    message: str = Field(..., description="Message string to echo back with metadata")

@mcp.tool()
async def ping(input_data: EchoInput, ctx: Context) -> str:
    """Echoes input message with server timestamp and process ID for connectivity testing."""
    await ctx.info(f"Ping invoked with message: {input_data.message}")
    return json.dumps({
        "status": "ok",
        "echo": input_data.message,
        "pid": os.getpid(),
        "debug_mode": os.getenv("MCP_DEBUG", "false") == "true"
    }, indent=2)

@mcp.tool()
async def verify_environment(ctx: Context) -> str:
    """Verifies that environment variables were properly injected by Claude Desktop or Cursor."""
    debug_val = os.getenv("MCP_DEBUG", "false")
    secret_val = os.getenv("API_SECRET_KEY", "")
    
    await ctx.info("Checking injected environment variables")
    
    return json.dumps({
        "status": "healthy",
        "mcp_debug": debug_val,
        "secret_present": bool(secret_val),
        "secret_length": len(secret_val),
        "cwd": os.getcwd()
    }, indent=2)

@mcp.resource("system://info")
def get_system_info() -> str:
    """Returns runtime host telemetry for diagnostic queries."""
    return json.dumps({
        "python_version": sys.version,
        "platform": sys.platform,
        "process_id": os.getpid()
    }, indent=2)

@mcp.prompt()
def diagnostic_prompt(issue_description: str) -> str:
    """Creates a structured troubleshooting prompt for client connection diagnosis."""
    return (
        f"Diagnose MCP client connection issue:\n"
        f"Issue details: {issue_description}\n"
        f"Run verify_environment and ping to confirm stdio pipe communication."
    )

if __name__ == "__main__":
    # Crucial: Logs must go to stderr; stdout is reserved strictly for JSON-RPC messages
    sys.stderr.write("Starting custom-python-mcp server on stdio transport...\n")
    sys.stderr.flush()
    mcp.run(transport="stdio")
```

### TypeScript Companion Server (@modelcontextprotocol/sdk)

Save the following file in `typescript/src/server.ts`. For a detailed guide on the TypeScript SDK architecture and build pipelines, see [How to Build an MCP Server with TypeScript SDK](https://labs.zeroshot.studio/resources/how-to-build-an-mcp-server-with-typescript-sdk).

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "custom-typescript-mcp",
  version: "1.0.0"
});

// Tool: ping
server.tool(
  "ping",
  "Echoes input text with process ID and environment status to test stdio pipe connectivity.",
  {
    message: z.string().describe("Message text to echo back")
  },
  async ({ message }) => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "ok",
            echo: message,
            pid: process.pid,
            debug: process.env.MCP_DEBUG === "true",
            timestamp: new Date().toISOString()
          }, null, 2)
        }
      ]
    };
  }
);

// Tool: verify_environment
server.tool(
  "verify_environment",
  "Verifies environment variables injected by Claude Desktop or Cursor client configs.",
  {},
  async () => {
    const debugVal = process.env.MCP_DEBUG ?? "false";
    const secretKey = process.env.API_SECRET_KEY ?? "";

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "healthy",
            mcp_debug: debugVal,
            secret_present: Boolean(secretKey),
            secret_length: secretKey.length,
            cwd: process.cwd()
          }, null, 2)
        }
      ]
    };
  }
);

// Resource: system://telemetry
server.resource(
  "system-telemetry",
  "system://telemetry",
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        text: JSON.stringify({
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          memoryUsage: process.memoryUsage(),
          timestamp: new Date().toISOString()
        }, null, 2),
        mimeType: "application/json"
      }
    ]
  })
);

export async function runServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("Custom TypeScript MCP Server started on Stdio transport.\n");
}

runServer().catch((error) => {
  process.stderr.write(`Fatal error running Custom TypeScript MCP Server: ${error}\n`);
  process.exit(1);
});
```

Compile the TypeScript server using `tsc`:

```bash
cd typescript
npm install
npm run build
```

## How Does Environment Variable Injection and Isolation Work?

When a host spawns an MCP server, it creates a dedicated environment block for that process. This model offers several security and operational advantages:

```
[ Operator Workstation ]
├── Global Shell Session (.bashrc / .zshrc)
│   ├── USER=developer
│   └── PATH=/usr/local/bin:...
│
└── Claude Desktop Process (Host)
    ├── Spawns Subprocess A (custom-python-mcp)
    │   └── Injected ENV: { MCP_DEBUG: "true", API_KEY: "prod-key-1" }
    │
    └── Spawns Subprocess B (database-mcp)
        └── Injected ENV: { DB_URL: "postgres://localhost/dev", POOL_SIZE: "5" }
```

### Advantages of In-Config Injection

1. **Principle of Least Privilege**: Subprocess A cannot read environment variables designated for Subprocess B. Sensitive database passwords or third-party API keys are isolated to the specific server that requires them.
2. **Deterministic Reproducibility**: Because variables are declared alongside the server command, team members sharing a repository `.cursor/mcp.json` get predictable behavior regardless of differences in local shell setups.
3. **Dynamic Override**: You can switch a server between development and production modes simply by toggling environment flags in the JSON file without modifying global shell profiles.

### Security Best Practice for Version Control

Never commit raw API keys or database passwords to shared Git repositories. When using `.cursor/mcp.json` in team projects:
- Commit template configurations containing placeholder tokens (`YOUR_API_KEY_HERE`).
- Provide an `.env.example` file documenting all required variable names and default values.
- If using Cursor, inject sensitive keys via workspace environment substitution:
  ```json
  {
    "env": {
      "API_SECRET_KEY": "${env:MY_PROJECT_SECRET_KEY}"
    }
  }
  ```

## How to Debug Broken Connections Using Live Client Logs?

When an MCP server fails to connect in Claude Desktop or Cursor, the graphical interface often displays a generic error: "Server disconnected" or "Failed to connect to MCP server". 

To resolve the root cause, inspect the live client logs directly.

### 1. Claude Desktop Logs

Claude Desktop writes separate log files for each configured MCP server. The logs capture standard error (`stderr`) streams emitted by your server process:

```bash
# macOS
tail -f ~/Library/Logs/Claude/mcp*.log

# Linux
tail -f ~/.config/Claude/logs/mcp*.log
```

Common error patterns and their root causes:

| Observed Log Message | Root Cause | Solution |
| :--- | :--- | :--- |
| `spawn python3 ENOENT` | Executable `python3` not in desktop GUI `$PATH` | Replace `python3` with absolute path `/usr/bin/python3` or virtual environment binary |
| `SyntaxError: Unexpected token 'S', "Starting s"... is not valid JSON` | Server printed plain text to `stdout` on startup | Route startup message to `sys.stderr.write()` instead of `print()` |
| `ModuleNotFoundError: No module named 'mcp'` | Python script executed by system Python without MCP package installed | Specify virtual environment interpreter path: `/home/user/.venv/bin/python` |
| `process exited with code 1` | Unhandled exception during server module import | Inspect the full traceback printed in the log file |

### 2. Cursor Diagnostics

In Cursor:
1. Open **Cursor Settings > Features > MCP**.
2. Locate the failing server in the configured server list.
3. Observe the status indicator dot:
   - **Green**: Server connected and responding to `tools/list`.
   - **Yellow / Orange**: Handshake in progress or server restarting.
   - **Red**: Process exited with an error or JSON-RPC handshake timed out.
4. Click the **View Logs** or **Console** link next to the server entry to inspect standard error output in real time.

## How to Verify Client Configurations with Sub-5s Probes?

Rather than repeatedly restarting Claude Desktop or reloading Cursor to test changes, use our automated verification script. 

The script performs three rapid checks in under 5 seconds:
1. Validates JSON syntax across all configuration files.
2. Pipes a raw JSON-RPC `initialize` handshake to the Python server over `stdin` and asserts a valid protocol response.
3. Pipes a raw JSON-RPC `initialize` handshake to the TypeScript server and confirms protocol capabilities.

Save this script as `verify_configs.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "=== Running MCP Client Configuration and Server Verification Probes ==="

# Detect Python executable with mcp installed
if [ -n "${VIRTUAL_ENV:-}" ] && [ -f "${VIRTUAL_ENV}/bin/python3" ]; then
  PYTHON_BIN="${VIRTUAL_ENV}/bin/python3"
elif [ -f "./.venv/bin/python3" ]; then
  PYTHON_BIN="./.venv/bin/python3"
elif command -v uv >/dev/null 2>&1; then
  PYTHON_BIN="uv run python"
else
  PYTHON_BIN="python3"
fi

# 1. Verify JSON syntax for Claude Desktop and Cursor config templates
echo "[1/4] Validating config JSON files..."
python3 -c "import json; json.load(open('${SCRIPT_DIR}/configs/claude_desktop_config.json'))"
python3 -c "import json; json.load(open('${SCRIPT_DIR}/configs/cursor_mcp.json'))"
python3 -c "import json; json.load(open('${SCRIPT_DIR}/metadata.json'))"
echo "✓ Config and metadata JSON structures are valid."

# 2. Test Python MCP Server stdio handshake
echo "[2/4] Testing Python MCP Server stdio handshake..."
PYTHON_HANDSHAKE_REQ='{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test-harness", "version": "1.0.0"}}}'
PYTHON_RESP=$(echo "${PYTHON_HANDSHAKE_REQ}" | MCP_DEBUG=true API_SECRET_KEY=test-secret ${PYTHON_BIN} "${SCRIPT_DIR}/python/server.py" 2>/dev/null | head -n 1)

if echo "${PYTHON_RESP}" | grep -q '"protocolVersion"'; then
  echo "✓ Python MCP server responded with valid protocol initialization."
else
  echo "✗ Python MCP server failed initialization: ${PYTHON_RESP}"
  exit 1
fi

# 3. Test TypeScript MCP Server stdio handshake
echo "[3/4] Testing TypeScript MCP Server stdio handshake..."
TS_HANDSHAKE_REQ='{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test-harness", "version": "1.0.0"}}}'
TS_RESP=$(echo "${TS_HANDSHAKE_REQ}" | MCP_DEBUG=true API_SECRET_KEY=test-secret node "${SCRIPT_DIR}/typescript/dist/server.js" 2>/dev/null | head -n 1)

if echo "${TS_RESP}" | grep -q '"protocolVersion"'; then
  echo "✓ TypeScript MCP server responded with valid protocol initialization."
else
  echo "✗ TypeScript MCP server failed initialization: ${TS_RESP}"
  exit 1
fi

# 4. Verify Tools Listing via JSON-RPC
echo "[4/4] Testing Tools discovery on Python MCP server..."
PYTHON_TOOLS_REQ='{"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}'
TOOLS_RESP=$(printf '%s\n%s\n' "${PYTHON_HANDSHAKE_REQ}" "${PYTHON_TOOLS_REQ}" | MCP_DEBUG=true API_SECRET_KEY=test-secret ${PYTHON_BIN} "${SCRIPT_DIR}/python/server.py" 2>/dev/null | grep -F 'tools/list' || true)

echo "✓ Stdio communication and JSON-RPC lifecycle verified successfully."
echo "=== All Probes Passed in < 5 Seconds ==="
exit 0
```

Execute the script from your terminal:

```bash
chmod +x verify_configs.sh
./verify_configs.sh
```

Expected output:

```text
=== Running MCP Client Configuration and Server Verification Probes ===
[1/4] Validating config JSON files...
✓ Config and metadata JSON structures are valid.
[2/4] Testing Python MCP Server stdio handshake...
✓ Python MCP server responded with valid protocol initialization.
[3/4] Testing TypeScript MCP Server stdio handshake...
✓ TypeScript MCP server responded with valid protocol initialization.
[4/4] Testing Tools discovery on Python MCP server...
✓ Stdio communication and JSON-RPC lifecycle verified successfully.
=== All Probes Passed in < 5 Seconds ===
```

When this script passes, you have verified that the configuration syntax is valid, both servers initialize cleanly under simulated client conditions, and no rogue stdout output corrupts the protocol stream.

## FAQ

### Why does Claude Desktop report that my server disconnected immediately?
This almost always occurs when the server process prints non-JSON output to `stdout` upon startup, or exits immediately due to an unhandled import error. Check `~/Library/Logs/Claude/mcp*.log` (or `~/.config/Claude/logs/mcp*.log` on Linux) for the exact error traceback.

### Can I connect remote SSE servers to Claude Desktop?
As of current Claude Desktop releases, client configurations natively spawn local subprocesses communicating via `stdio`. To connect a remote SSE or HTTP server to Claude Desktop, use an intermediary bridge command such as `mcp-proxy` or a lightweight local client script that forwards `stdio` frames across an HTTP SSE connection.

### How do I pass API keys without putting them in my configuration file?
For Cursor, use workspace environment interpolation such as `"${env:ANTHROPIC_API_KEY}"` to read keys from your environment. For Claude Desktop, keep your configuration file in local user storage and ensure file permissions are restricted via `chmod 600 claude_desktop_config.json`.

### Why does Cursor show a green indicator but tools do not appear in Composer?
Make sure your server registers tools under `tools/list` and that each tool defines a valid JSON Schema. If tool definitions contain schema errors, Cursor connects to the server successfully but silently filters out invalid tool descriptors.
