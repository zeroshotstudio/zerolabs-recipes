# Recipe 25: Connect Claude Desktop and Cursor to Custom MCP Servers

This repository provides production configuration templates and reference companion MCP servers for connecting **Claude Desktop** and **Cursor** to custom Model Context Protocol (MCP) services.

## Overview

Claude Desktop and Cursor spawn MCP servers as isolated child subprocesses communicating across standard input/output (`stdio`). This module demonstrates:
- Correct JSON schema definitions for `claude_desktop_config.json` and `.cursor/mcp.json`.
- Environment variable injection (`env`) for API keys, secret credentials, and flags without polluting global environment scopes.
- Python (`FastMCP`) and TypeScript (`@modelcontextprotocol/sdk`) companion servers.
- Sub-5-second verification probes simulating client JSON-RPC handshakes (`initialize`, `tools/list`).
- Real-time diagnostic procedures using client logs (`~/Library/Logs/Claude/mcp*.log` or Linux equivalents).

## Project Structure

```
.
├── .env.example                       # Reference environment variables
├── metadata.json                      # Module and SEO metadata
├── README.md                          # Repository instructions
├── verify_configs.sh                  # Executable probe validating configs and stdio handshakes
├── configs/
│   ├── claude_desktop_config.json    # Claude Desktop client configuration template
│   └── cursor_mcp.json               # Cursor IDE client configuration template (.cursor/mcp.json)
├── python/
│   └── server.py                      # Companion Python MCP server (FastMCP)
└── typescript/
    ├── package.json                   # Dependencies (@modelcontextprotocol/sdk, zod)
    ├── tsconfig.json                  # NodeNext TypeScript compilation settings
    ├── src/
    │   └── server.ts                  # Companion TypeScript MCP server
    └── dist/                          # Compiled JavaScript distribution
```

## Quickstart

### 1. Run Verification Probe

Verify JSON configurations and test standard input/output protocol handshakes for both servers in under 5 seconds:

```bash
chmod +x verify_configs.sh
./verify_configs.sh
```

### 2. Configure Claude Desktop

Locate your configuration file based on your operating system:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add the server entries from `configs/claude_desktop_config.json`, replacing absolute paths with your repository directory:

```json
{
  "mcpServers": {
    "custom-python-mcp": {
      "command": "python3",
      "args": [
        "/absolute/path/to/projects/zerolabs-recipes/recipes/claude/25-connect-desktop-cursor-mcp/python/server.py"
      ],
      "env": {
        "MCP_DEBUG": "true",
        "API_SECRET_KEY": "your-secure-api-key"
      }
    }
  }
}
```

Restart Claude Desktop. Inspect logs for connection status:
```bash
# macOS
tail -f ~/Library/Logs/Claude/mcp*.log

# Linux
tail -f ~/.config/Claude/logs/mcp*.log
```

### 3. Configure Cursor IDE

Cursor supports project-level MCP server configurations via `.cursor/mcp.json` or global configuration via **Cursor Settings > Features > MCP**.

Create `.cursor/mcp.json` at your project root:

```json
{
  "mcpServers": {
    "custom-typescript-mcp": {
      "command": "node",
      "args": [
        "${workspaceFolder}/recipes/claude/25-connect-desktop-cursor-mcp/typescript/dist/server.js"
      ],
      "env": {
        "MCP_DEBUG": "true",
        "API_SECRET_KEY": "your-secure-api-key"
      }
    }
  }
}
```

Open Cursor Settings, verify the green status indicator next to the server entry, and verify that the tools (`ping`, `verify_environment`) appear in the tools panel.

## Troubleshooting

1. **JSON-RPC Parse Errors**: Ensure your server scripts **never write plain text or debugging messages to stdout**. All logs must be written to `stderr` (`sys.stderr.write` or `console.error`).
2. **Missing Environment Variables**: MCP child processes do not inherit the user's interactive shell profile (`.bashrc` or `.zshrc`). Always specify necessary runtime variables in the `env` block.
3. **Executable Resolution**: Use absolute paths or package manager runners (`uv run python`, `npx tsx`) to avoid path resolution errors in desktop GUI environments.
