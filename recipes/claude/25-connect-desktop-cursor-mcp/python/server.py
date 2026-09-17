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

class HealthCheckResponse(BaseModel):
    status: str
    debug_mode: bool
    secret_configured: bool
    python_version: str

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
