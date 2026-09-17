"""
Dual-Transport Model Context Protocol (MCP) Server in Python.
Supports standard I/O (stdio) transport and Server-Sent Events (SSE) over Starlette/Uvicorn.
"""

import argparse
import asyncio
import logging
import os
import sys
from typing import Any

import mcp.server.stdio
from mcp.server import NotificationOptions, Server
from mcp.server.models import InitializationOptions
from mcp.server.sse import SseServerTransport
import mcp.types as types
from starlette.applications import Starlette
from starlette.routing import Route
import uvicorn

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stderr)],
)
logger = logging.getLogger("mcp-transport-server")

# Instantiate server instance with capability declarations
server = Server("transport-showcase-server")


@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    """Declare available tool definitions."""
    return [
        types.Tool(
            name="system_diagnostic",
            description="Returns system runtime statistics, transport mode, and process health.",
            inputSchema={
                "type": "object",
                "properties": {
                    "verbose": {
                        "type": "boolean",
                        "description": "Whether to return verbose diagnostic attributes.",
                        "default": False,
                    }
                },
            },
        )
    ]


@server.call_tool()
async def handle_call_tool(
    name: str, arguments: dict[str, Any] | None
) -> list[types.TextContent]:
    """Handle incoming tool invocation requests."""
    if name != "system_diagnostic":
        raise ValueError(f"Unknown tool requested: {name}")

    args = arguments or {}
    verbose = args.get("verbose", False)

    diagnostic_payload = {
        "status": "operational",
        "transport": os.environ.get("MCP_TRANSPORT", "active"),
        "pid": os.getpid(),
        "python_version": sys.version.split()[0],
        "verbose_mode": verbose,
    }

    return [
        types.TextContent(
            type="text",
            text=f"System Diagnostic Result:\n{diagnostic_payload}",
        )
    ]


async def run_stdio() -> None:
    """Run server over standard input and output channels."""
    logger.info("Initializing Stdio transport runner...")
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="transport-showcase-server",
                server_version="1.0.0",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )


def create_sse_application() -> Starlette:
    """Construct Starlette application for SSE transport endpoints."""
    sse = SseServerTransport("/messages")

    async def handle_sse(request: Any) -> Any:
        async with sse.connect_sse(
            request.scope, request.receive, request._send
        ) as streams:
            await server.run(
                streams[0],
                streams[1],
                InitializationOptions(
                    server_name="transport-showcase-server",
                    server_version="1.0.0",
                    capabilities=server.get_capabilities(
                        notification_options=NotificationOptions(),
                        experimental_capabilities={},
                    ),
                ),
            )

    async def handle_messages(request: Any) -> Any:
        await sse.handle_post_message(request.scope, request.receive, request._send)

    routes = [
        Route("/sse", endpoint=handle_sse),
        Route("/messages", endpoint=handle_messages, methods=["POST"]),
    ]

    return Starlette(debug=True, routes=routes)


def main() -> None:
    """Parse runtime arguments and launch chosen transport listener."""
    parser = argparse.ArgumentParser(
        description="Dual-Transport Model Context Protocol (MCP) Server"
    )
    parser.add_argument(
        "--transport",
        choices=["stdio", "sse"],
        default=os.environ.get("MCP_TRANSPORT", "sse"),
        help="Transport mechanism to bind (stdio or sse).",
    )
    parser.add_argument(
        "--host",
        default=os.environ.get("MCP_HOST", "127.0.0.1"),
        help="Host interface to bind HTTP listener.",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("MCP_PORT", "8000")),
        help="Port number for HTTP SSE listener.",
    )

    args = parser.parse_args()

    if args.transport == "stdio":
        logger.info("Starting MCP server in stdio mode...")
        asyncio.run(run_stdio())
    elif args.transport == "sse":
        logger.info("Starting MCP server in SSE mode on %s:%s...", args.host, args.port)
        app = create_sse_application()
        uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
