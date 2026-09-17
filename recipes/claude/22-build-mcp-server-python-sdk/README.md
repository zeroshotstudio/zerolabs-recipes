# Recipe 22: How to Build an MCP Server with Python SDK

This recipe provides a production-ready Model Context Protocol (MCP) server implementation using Python, FastMCP, and the official Anthropic MCP Python SDK (`mcp>=1.0.0`).

## Overview

The Model Context Protocol establishes an open, standardized protocol for connecting AI models to external tools, databases, and context repositories. This repository implements:
- **FastMCP Server Lifecycle**: Fast, declarative server initialization.
- **Custom MCP Tools (`@mcp.tool()`)**: Typed functions using Pydantic models for argument validation and runtime error trapping.
- **Context Injection (`Context`)**: Emitting progress notifications, structured log messages (`ctx.info`, `ctx.error`), and reading client request contexts.
- **MCP Resources (`@mcp.resource()`)**: Exposing read-only operational state via static and dynamic URI templates (`cluster://topology/overview`, `playbook://incident/{incident_type}`).
- **MCP Prompts (`@mcp.prompt()`)**: Reusable LLM workflow templates that inject prompt instructions into the host client.
- **Standard I/O Transport (stdio)**: Native process communication for seamless integration with Claude Desktop, Cursor, and autonomous agent platforms.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Claude / MCP Client                       │
│    (Claude Desktop, Cursor, Agent Orchestration Engine)     │
└──────────────────────────────┬──────────────────────────────┘
                               │ JSON-RPC 2.0 over Stdio
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 FastMCP Python SDK Server                   │
│                                                             │
│  ┌─────────────────┐ ┌───────────────────┐ ┌─────────────┐  │
│  │   Tools         │ │   Resources       │ │   Prompts   │  │
│  │ @mcp.tool()     │ │ @mcp.resource()   │ │ @mcp.prompt()│ │
│  │ - Pydantic v2   │ │ - Static URIs     │ │ - Templating│  │
│  │ - Context logs  │ │ - Dynamic URIs    │ │ - Workflows │  │
│  └─────────────────┘ └───────────────────┘ └─────────────┘  │
│                                                             │
│                  Internal Service Layer                     │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
.
├── .env.example
├── metadata.json
├── README.md
├── blog-post.md
├── test_probe.sh
└── python/
    ├── client_test.py
    ├── requirements.txt
    └── server.py
```

## Setup & Quickstart

### 1. Install Dependencies

Create a virtual environment and install the required dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r python/requirements.txt
```

### 2. Run the Automated Test Probe

Execute the end-to-end integration probe to verify stdio client-server communication, tool execution, resource reading, and prompt resolution:

```bash
chmod +x test_probe.sh
./test_probe.sh
```

### 3. Configure with Claude Desktop

To connect this MCP server directly to Claude Desktop, add the following configuration to your `claude_desktop_config.json`:

On macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`  
On Linux: `~/.config/Claude/claude_desktop_config.json`  
On Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "python-production-ops": {
      "command": "/path/to/venv/bin/python",
      "args": [
        "/path/to/recipes/claude/22-build-mcp-server-python-sdk/python/server.py"
      ],
      "env": {
        "APP_ENV": "production"
      }
    }
  }
}
```

## Code Examples

### Defining a Validated Tool with Context

```python
from pydantic import BaseModel, Field
from mcp.server.fastmcp import FastMCP, Context

mcp = FastMCP("ops-server")

class RestartDeploymentRequest(BaseModel):
    deployment_id: str = Field(..., description="Unique deployment identifier")
    grace_period_seconds: int = Field(default=30, ge=5, le=300)
    reason: str = Field(..., min_length=5, max_length=200)

@mcp.tool()
async def restart_service(request: RestartDeploymentRequest, ctx: Context) -> str:
    """Trigger graceful restart for a target deployment."""
    await ctx.info(f"Restarting {request.deployment_id}")
    # Application logic here
    return f"Deployment {request.deployment_id} restart initiated."
```

### Defining Static & Dynamic Resources

```python
@mcp.resource("cluster://topology/overview")
def get_cluster_overview() -> str:
    """Read-only topology overview."""
    return '{"cluster": "us-east-prod", "status": "nominal"}'

@mcp.resource("playbook://incident/{incident_type}")
def get_incident_playbook(incident_type: str) -> str:
    """Retrieve operational playbook for specific incidents."""
    return f"Playbook steps for {incident_type}..."
```

## Related Recipes

- [How to Define and Register Tools with Claude](https://labs.zeroshot.studio/resources/how-to-define-and-register-tools-with-claude)
- [How to Implement Strict Tool Use and Error Recovery Loops](https://labs.zeroshot.studio/resources/how-to-implement-strict-tool-use-and-error-recovery-loops)
- [How to Integrate and Sandbox the Claude Bash Tool](https://labs.zeroshot.studio/resources/how-to-integrate-and-sandbox-the-claude-bash-tool)
