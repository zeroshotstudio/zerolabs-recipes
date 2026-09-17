#!/usr/bin/env python3
"""
Remote Model Context Protocol (MCP) Server with Bearer Authentication & SSE.
Designed for secure reverse proxy deployment behind Nginx, Cloudflare Tunnels, or Tailscale Funnel.
"""

import os
import hmac
import secrets
from typing import Dict
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.routing import Route
import uvicorn
from mcp.server.fastmcp import FastMCP
from mcp.server.sse import SseServerTransport

# Configuration from environment
AUTH_TOKEN = os.getenv("MCP_AUTH_TOKEN", "default-insecure-dev-token-change-in-production")
PORT = int(os.getenv("MCP_PORT", "8000"))
HOST = os.getenv("MCP_HOST", "0.0.0.0")

# Initialize FastMCP application instance
mcp = FastMCP("ProductionRemoteOps")

@mcp.tool()
def query_system_metrics() -> dict:
    """Retrieve operational health metrics from the remote server environment."""
    return {
        "status": "healthy",
        "load_average": [0.12, 0.08, 0.05],
        "uptime_seconds": 86400,
        "active_tenants": 4,
        "protocol_version": "2024-11-05"
    }

@mcp.tool()
def execute_database_diagnostics(cluster_id: str) -> dict:
    """Run read-only database cluster connection diagnostics."""
    return {
        "cluster_id": cluster_id,
        "connection_pool": {"active": 12, "idle": 28, "max": 50},
        "replication_lag_ms": 1.4,
        "status": "synchronized"
    }

# Active SSE Transports indexed by Session ID
active_transports: Dict[str, SseServerTransport] = {}

def verify_token(authorization_header: str | None) -> bool:
    """Constant-time bearer token validation to prevent timing attacks."""
    if not authorization_header or not authorization_header.startswith("Bearer "):
        return False
    incoming_token = authorization_header[len("Bearer "):].strip()
    return secrets.compare_digest(incoming_token, AUTH_TOKEN)

async def handle_sse(request: Request) -> Response:
    """Handle SSE connection initiation and register session."""
    auth_header = request.headers.get("Authorization")
    if not verify_token(auth_header):
        return JSONResponse({"error": "Unauthorized", "message": "Valid Bearer token required"}, status_code=401)

    transport = SseServerTransport("/messages/")
    session_id = secrets.token_urlsafe(16)
    active_transports[session_id] = transport

    async with transport.connect_sse(request.scope, request.receive, request._send) as streams:
        await mcp._mcp_server.run(streams[0], streams[1], mcp._mcp_server.create_initialization_options())
    
    active_transports.pop(session_id, None)
    return Response(status_code=200)

async def handle_messages(request: Request) -> Response:
    """Handle incoming JSON-RPC client messages routed to active SSE session."""
    auth_header = request.headers.get("Authorization")
    if not verify_token(auth_header):
        return JSONResponse({"error": "Unauthorized", "message": "Valid Bearer token required"}, status_code=401)

    session_id = request.query_params.get("sessionId") or request.headers.get("Mcp-Session-Id")
    if not session_id or session_id not in active_transports:
        return JSONResponse({"error": "Bad Request", "message": "Invalid or missing sessionId"}, status_code=400)

    transport = active_transports[session_id]
    await transport.handle_post_message(request.scope, request.receive, request._send)
    return Response(status_code=202)

async def handle_health(request: Request) -> Response:
    """Health check endpoint for reverse proxy probes."""
    return JSONResponse({
        "status": "online",
        "service": "remote-mcp-server",
        "active_sessions": len(active_transports)
    })

routes = [
    Route("/sse", endpoint=handle_sse, methods=["GET"]),
    Route("/messages/", endpoint=handle_messages, methods=["POST"]),
    Route("/health", endpoint=handle_health, methods=["GET"])
]

middleware = [
    Middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["Mcp-Session-Id"]
    )
]

app = Starlette(routes=routes, middleware=middleware)

if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
