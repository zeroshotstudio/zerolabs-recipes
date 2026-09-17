> **Key Takeaway:** Model Context Protocol supports two primary transport abstractions: local subprocess standard I/O (stdio) for zero-latency desktop workflows, and Server-Sent Events (SSE) over HTTP for networked, multi-tenant agent deployments. Implementing resilient SSE architectures requires decoupled bi-directional message dispatching, strict session lifecycle negotiation via unique session identifiers, keep-alive heartbeat pings, and unbuffered reverse proxy configuration.
>
> - Stdio transport binds directly to standard input and standard output streams, providing immediate process containment without network port management or transport-layer encryption overhead.
> - SSE transport establishes an asymmetric communication loop: a long-lived text/event-stream GET connection delivers server-to-client notifications and JSON-RPC responses, while discrete HTTP POST requests submit client-to-server commands.
> - Production SSE architectures demand session continuity mechanisms (`Mcp-Session-Id`), defensive 15-second heartbeat intervals to survive firewall timeouts, and Nginx reverse proxy buffering disabled via `proxy_buffering off;`.

Connecting large language models to external data stores, runtime environments, and enterprise toolchains requires resilient, standardized communication channels. The Model Context Protocol (MCP) establishes an open standard for secure, bi-directional interaction between AI models, client hosts (such as Claude Code, Cursor, and custom agentic runtimes), and specialized tool servers.

Under the MCP specification, the application layer uses JSON-RPC 2.0 messages. However, how those messages traverse the physical boundary between host and server depends on the transport layer. Choosing and correctly configuring the transport layer determines whether your deployment runs with sub-millisecond local latency or scales horizontally across distributed cloud infrastructure.

In this guide, we examine the architectural differences between Stdio and Server-Sent Events (SSE) transports. We walk through complete, dual-transport server implementations in both Python and TypeScript, examine session lifecycle management and message routing mechanics, configure resilient reverse proxies with Nginx, and verify operational health using rapid cURL diagnostic probes.

Companion code repository: [ZeroLabs Claude Recipes Monorepo](https://github.com/zeroshotstudio/zerolabs-recipes/tree/main/recipes/claude/24-configure-stdio-and-sse-mcp-transports).

## Contents

- [Why Does MCP Decouple the Transport Layer from JSON-RPC?](#why-does-mcp-decouple-the-transport-layer-from-json-rpc)
- [What Are the Hard Rules of MCP Transport Architecture?](#what-are-the-hard-rules-of-mcp-transport-architecture)
- [How Do Stdio and SSE Transports Compare?](#how-do-stdio-and-sse-transports-compare)
- [How Does the SSE Connection and Session Lifecycle Work?](#how-does-the-sse-connection-and-session-lifecycle-work)
- [How to Implement a Dual-Transport MCP Server in Python?](#how-to-implement-a-dual-transport-mcp-server-in-python)
- [How to Implement a Dual-Transport MCP Server in TypeScript?](#how-to-implement-a-dual-transport-mcp-server-in-typescript)
- [How to Configure Nginx for Resilient SSE Streaming?](#how-to-configure-nginx-for-resilient-sse-streaming)
- [How to Verify SSE Transports with Sub-5s cURL Probes?](#how-to-verify-sse-transports-with-sub-5s-curl-probes)
- [How to Troubleshoot Transport Bottlenecks and Dropped Streams?](#how-to-troubleshoot-transport-bottlenecks-and-dropped-streams)
- [FAQ](#faq)

## Why Does MCP Decouple the Transport Layer from JSON-RPC?

Traditional agent integrations tightly bind message framing to a specific network protocol, such as raw WebSockets or static REST endpoints. This coupling introduces operational frictions:

1. **Subprocess Management Complexity**: Local desktop tools running on an operator's workstation should not require opening listening TCP ports, managing TLS certificates, or configuring firewall rules. They benefit from process-level isolation where standard input and output form a private, zero-configuration communication pipeline.
2. **Horizontal Scaling and Remote Access**: Enterprise database connectors, code indexing workers, and shared team tools cannot live inside every developer's local subprocess space. They must run remotely on hardened infrastructure, protected by enterprise authentication and accessible over standard web protocols.
3. **Infrastructure Interoperability**: Firewalls and corporate proxies frequently terminate long-lived bi-directional WebSocket connections or strip non-standard HTTP upgrades. Server-Sent Events operates over vanilla HTTP/1.1 or HTTP/2 GET requests, passing through corporate proxies without specialized tunneling.

By decoupling the JSON-RPC framing specification from physical transport mechanics, MCP allows developers to write server logic once and deploy it anywhere. The same tool definition can serve a local developer running Cursor via Stdio or an entire engineering department querying an internal Kubernetes cluster over SSE.

For a broader perspective on MCP design patterns and client wiring, see our [Full-Stack MCP Cheatsheet for Servers and SSE](/resources/full-stack-mcp-cheatsheet) and our foundational guide on [How to Implement Server-Sent Event Streaming with Claude](/resources/how-to-implement-server-sent-event-streaming-with-claude).

## What Are the Hard Rules of MCP Transport Architecture?

When building production MCP infrastructure, our team enforces five non-negotiable transport engineering rules:

1. **Stdout Cleanliness in Stdio Mode**: Standard output (`stdout`) belongs exclusively to the JSON-RPC protocol parser. Never emit runtime logs, debug statements, banner messages, or print calls to `stdout`. Any non-JSON text emitted to `stdout` corrupts the client-side JSON-RPC stream and causes immediate connection termination. All logging must route strictly to standard error (`stderr`).
2. **Explicit Session Id Continuity in SSE**: The initial SSE handshake provides the downstream message routing path and, in multi-client architectures, an explicit `Mcp-Session-Id` header or query parameter. Every subsequent client POST request must supply this session identifier so the server routes responses to the corresponding SSE stream.
3. **Unbuffered Streaming Proxies**: Any reverse proxy sitting between an MCP client and an SSE server must disable downstream response buffering (`proxy_buffering off;`). Buffer accumulation delays event dispatching until buffer fill limits are reached, resulting in client read timeouts.
4. **Active Keep-Alive Pings**: Mobile gateways, AWS Application Load Balancers, and corporate firewalls aggressively close idle TCP connections after 30 to 60 seconds of inactivity. SSE servers must emit periodic comment frames or JSON-RPC ping requests at 15-second intervals to maintain connection persistence.
5. **Clean Cancellation and Teardown**: Closing an SSE connection or terminating a stdio subprocess must trigger immediate resource de-allocation, including unregistering subscriptions, aborting in-flight tool tasks, and freeing database connections.

## How Do Stdio and SSE Transports Compare?

Choosing between Stdio and SSE depends on deployment topology, network boundaries, and concurrency requirements:

| Architectural Metric | Stdio Transport | Server-Sent Events (SSE) Transport |
| :--- | :--- | :--- |
| **Execution Topology** | Local child subprocess spawned by client host | Remote network service (or local HTTP daemon) |
| **Communication Medium** | POSIX pipes (stdin / stdout) | HTTP/1.1 or HTTP/2 streaming + HTTP POST |
| **Port & Network Overhead** | None (Zero open ports, no TCP handshakes) | Requires bound TCP/IP port and HTTP router |
| **Security Boundary** | OS process privileges and file permissions | Network TLS, bearer tokens, OAuth, reverse proxy |
| **Multi-Client Support** | 1:1 coupling (one process per client session) | 1:N multiplexing (one server handles many sessions) |
| **Reverse Proxy Compatibility** | Not Applicable | Requires `proxy_buffering off` and chunked encoding |
| **Debugging Complexity** | Low (inspect stderr logs or pipe JSON) | Moderate (inspect HTTP frames, SSE headers, CORS) |
| **Typical Target Use Case** | Local CLI tools, editor extensions, desktop LLMs | Centralized databases, SaaS tools, cloud agents |

## How Does the SSE Connection and Session Lifecycle Work?

Unlike WebSockets, which establish a symmetric, bi-directional socket over a single upgraded connection, MCP Server-Sent Events uses an asymmetric two-pipe model over HTTP.

```
+---------------+                              +---------------+
|  MCP Client   |                              |  MCP Server   |
| (Claude/IDE)  |                              | (Python / TS) |
+---------------+                              +---------------+
        |                                              |
        | 1. GET /sse (Accept: text/event-stream)      |
        |--------------------------------------------->|
        |                                              |
        | 2. HTTP 200 OK + "endpoint" event            |
        |    event: endpoint                           |
        |    data: /messages?sessionId=sess_8f3a1...   |
        |<---------------------------------------------|
        |                                              |
        | 3. POST /messages?sessionId=sess_8f3a1...    |
        |    Body: {"method":"initialize", ...}        |
        |--------------------------------------------->|
        |                                              |
        | 4. HTTP 202 Accepted (acknowledges POST)     |
        |<---------------------------------------------|
        |                                              |
        | 5. SSE event: message                        |
        |    data: {"result":{"capabilities":...}}     |
        |<---------------------------------------------|
        |                                              |
        | 6. Periodic Keep-Alive Ping                  |
        |    event: ping / :keep-alive comment         |
        |<---------------------------------------------|
```

The sequence unfolds in four discrete stages:

1. **The Handshake (`GET /sse`)**: The client initiates an HTTP GET request to the `/sse` route, passing the header `Accept: text/event-stream`. The server responds with `Content-Type: text/event-stream`, disables caching, and emits an initial event named `endpoint`. The data field of this event contains the URI where the client must dispatch subsequent JSON-RPC messages (e.g., `/messages?sessionId=sess_8f3a1`).
2. **Downstream Dispatch (`POST /messages`)**: When the client issues a tool call, resource fetch, or prompt template request, it sends an HTTP POST request containing the JSON-RPC payload to the URI provided in step 1.
3. **Asynchronous Notification Delivery**: The server processes the request and streams the corresponding JSON-RPC response back over the established SSE connection as a `message` event.
4. **Heartbeat and Keep-Alive**: The server regularly transmits heartbeat comment frames (`: ping\n\n`) to prevent intermediate NAT gateways and proxies from silently terminating idle connections.

## How to Implement a Dual-Transport MCP Server in Python?

Using the official Python `mcp` library along with `starlette` and `uvicorn`, we can construct a unified server that binds to either Stdio or SSE based on command-line flags or environment variables.

### Project Dependencies (`requirements.txt`)

```txt
mcp>=1.3.0
starlette>=0.38.0
uvicorn>=0.30.0
pydantic>=2.0.0
httpx>=0.27.0
python-dotenv>=1.0.0
```

### Server Implementation (`python/server_sse.py`)

```python
"""
Dual-Transport Model Context Protocol (MCP) Server in Python.
Demonstrates standard I/O (stdio) transport and Server-Sent Events (SSE) over Starlette.
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

# Direct all application logs strictly to stderr to prevent stdio protocol corruption
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stderr)],
)
logger = logging.getLogger("mcp-transport-server")

# Instantiate server instance
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
    """Run server over standard input and output streams."""
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
    """Construct Starlette application exposing SSE transport endpoints."""
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
```

## How to Implement a Dual-Transport MCP Server in TypeScript?

In TypeScript environments, the `@modelcontextprotocol/sdk` package provides first-class primitives for both `StdioServerTransport` and `SSEServerTransport`. We pair this with an Express HTTP server.

### Project Configuration (`typescript/package.json`)

```json
{
  "name": "mcp-transport-server-ts",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/server_sse.js",
    "dev:sse": "ts-node src/server_sse.ts --transport sse",
    "dev:stdio": "ts-node src/server_sse.ts --transport stdio"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.6.0",
    "dotenv": "^16.4.5",
    "express": "^4.19.2"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.14.0",
    "ts-node": "^10.9.2",
    "typescript": "^5.4.5"
  }
}
```

### TypeScript Server Implementation (`typescript/src/server_sse.ts`)

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express, { Request, Response } from "express";

// Initialize core MCP Server instance
const server = new Server(
  {
    name: "ts-transport-showcase-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tool listing handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "health_check",
        description: "Returns process uptime, memory consumption, and transport runtime statistics.",
        inputSchema: {
          type: "object",
          properties: {
            detailed: {
              type: "boolean",
              description: "Include memory layout and node environment stats.",
            },
          },
        },
      },
    ],
  };
});

// Register tool execution handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "health_check") {
    throw new Error(`Tool not found: ${request.params.name}`);
  }

  const detailed = Boolean(request.params.arguments?.detailed);
  const memoryUsage = process.memoryUsage();

  const diagnosticData = {
    status: "healthy",
    uptimeSeconds: Math.floor(process.uptime()),
    pid: process.pid,
    nodeVersion: process.version,
    memory: detailed
      ? {
          heapUsedMb: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2),
          heapTotalMb: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2),
          rssMb: (memoryUsage.rss / 1024 / 1024).toFixed(2),
        }
      : undefined,
  };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(diagnosticData, null, 2),
      },
    ],
  };
});

async function runStdio(): Promise<void> {
  console.error("[MCP] Initializing Stdio transport...");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[MCP] Stdio transport successfully connected.");
}

function runSSE(host: string, port: number): void {
  const app = express();
  let sseTransport: SSEServerTransport | null = null;

  // Endpoint 1: SSE Handshake and persistent event stream
  app.get("/sse", async (req: Request, res: Response) => {
    console.error("[MCP] Inbound SSE connection initialized from", req.ip);
    
    // Construct transport targeting the downstream message POST path
    sseTransport = new SSEServerTransport("/messages", res);
    
    // Connect server to transport
    await server.connect(sseTransport);

    req.on("close", () => {
      console.error("[MCP] Client terminated SSE connection.");
    });
  });

  // Endpoint 2: Client JSON-RPC dispatch endpoint
  app.post("/messages", async (req: Request, res: Response) => {
    if (!sseTransport) {
      res.status(400).json({ error: "SSE transport stream not active. Initialize /sse first." });
      return;
    }
    console.error("[MCP] Processing inbound JSON-RPC message payload");
    await sseTransport.handlePostMessage(req, res);
  });

  app.listen(port, host, () => {
    console.error(`[MCP] SSE Transport Server listening at http://${host}:${port}`);
    console.error(`[MCP] SSE Stream: http://${host}:${port}/sse`);
    console.error(`[MCP] Messages:   http://${host}:${port}/messages`);
  });
}

// Bootstrap selector based on CLI arguments
const transportMode = process.argv.includes("--transport")
  ? process.argv[process.argv.indexOf("--transport") + 1]
  : process.env.MCP_TRANSPORT || "sse";

const host = process.env.MCP_HOST || "127.0.0.1";
const port = parseInt(process.env.MCP_PORT || "8000", 10);

if (transportMode === "stdio") {
  runStdio().catch((err) => {
    console.error("[MCP Fatal] Stdio transport failure:", err);
    process.exit(1);
  });
} else {
  runSSE(host, port);
}
```

## How to Configure Nginx for Resilient SSE Streaming?

Deploying remote MCP servers behind a reverse proxy introduces critical buffering pitfalls. By default, Nginx buffers upstream responses in memory before writing to client sockets. For Server-Sent Events, this delays individual event frames indefinitely until the buffer threshold is satisfied.

To prevent stream stalling, configure Nginx with disabled buffering, chunked transfer encoding, and extended connection timeouts:

```nginx
server {
    listen 443 ssl http2;
    server_name mcp.internal.yourdomain.com;

    ssl_certificate /etc/ssl/certs/mcp-server.crt;
    ssl_certificate_key /etc/ssl/private/mcp-server.key;

    location /sse {
        proxy_pass http://127.0.0.1:8000/sse;

        # Crucial: Disable upstream buffering for real-time SSE streaming
        proxy_buffering off;
        proxy_cache off;

        # Keep connection open across idle tool periods
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;

        # Force HTTP/1.1 to preserve streaming chunk mechanics
        proxy_http_version 1.1;
        proxy_set_header Connection "";

        # Standard proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Prevent browser caching
        add_header Cache-Control "no-cache, no-transform";
    }

    location /messages {
        proxy_pass http://127.0.0.1:8000/messages;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## How to Verify SSE Transports with Sub-5s cURL Probes?

Automated health probes must verify both the SSE stream endpoint and the downstream message dispatch mechanism within five seconds.

### Automated Diagnostic Script (`curl_probe.sh`)

```bash
#!/usr/bin/env bash
set -euo pipefail

HOST="${MCP_HOST:-127.0.0.1}"
PORT="${MCP_PORT:-8000}"
BASE_URL="http://${HOST}:${PORT}"

echo "Step 1: Probing SSE Stream Endpoint (${BASE_URL}/sse)..."

# Perform 3-second stream capture to verify headers and initial endpoint event
SSE_OUTPUT=$(curl -sN -m 3 -H "Accept: text/event-stream" "${BASE_URL}/sse" || true)

echo "Received SSE Initial Stream Output:"
echo "${SSE_OUTPUT}"
echo ""

# Extract downstream endpoint URI
ENDPOINT_URI=$(echo "${SSE_OUTPUT}" | grep -E '^data: ' | head -n 1 | sed 's/^data: //g')

if [ -z "${ENDPOINT_URI}" ]; then
  ENDPOINT_URL="${BASE_URL}/messages"
  echo "Defaulting downstream path to ${ENDPOINT_URL}"
else
  if [[ "${ENDPOINT_URI}" == http* ]]; then
    ENDPOINT_URL="${ENDPOINT_URI}"
  else
    ENDPOINT_URL="${BASE_URL}${ENDPOINT_URI}"
  fi
  echo "Discovered downstream dispatch endpoint: ${ENDPOINT_URL}"
fi

echo "Step 2: Dispatching JSON-RPC Initialize Payload via POST..."

INIT_PAYLOAD='{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {
      "name": "curl-probe-client",
      "version": "1.0.0"
    }
  }
}'

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${ENDPOINT_URL}" \
  -H "Content-Type: application/json" \
  -d "${INIT_PAYLOAD}")

echo "POST returned HTTP status: ${HTTP_STATUS}"

if [ "${HTTP_STATUS}" -eq 200 ] || [ "${HTTP_STATUS}" -eq 202 ]; then
  echo "Probe status: Operational (HTTP ${HTTP_STATUS})"
else
  echo "Probe failure: Unexpected status ${HTTP_STATUS}"
  exit 1
fi
```

### Manual Interactive Verification

Open two terminal panes to observe the bi-directional exchange in real time:

In **Terminal Pane 1**, open the streaming consumer:

```bash
curl -N -H "Accept: text/event-stream" http://127.0.0.1:8000/sse
```

Expected output:

```http
event: endpoint
data: /messages
```

In **Terminal Pane 2**, post an initialization frame:

```bash
curl -i -X POST http://127.0.0.1:8000/messages \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "manual-curl", "version": "1.0.0"}
    }
  }'
```

Terminal 2 receives `HTTP/1.1 202 Accepted` (or `200 OK`), while Terminal 1 immediately renders the server response:

```http
event: message
data: {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"transport-showcase-server","version":"1.0.0"}}}
```

## How to Troubleshoot Transport Bottlenecks and Dropped Streams?

When operating MCP servers across enterprise network boundaries, common failure modes include:

### 1. JSON-RPC Parse Failures in Stdio Mode
- **Symptom**: Client host disconnects immediately upon startup with `Unexpected token in JSON at position 0`.
- **Root Cause**: A third-party dependency or stray `print()` statement emitted non-JSON text to standard output.
- **Remedy**: Audit all logging configurations. Ensure root loggers stream strictly to `sys.stderr`. For Python subprocesses, set the environment variable `PYTHONUNBUFFERED=1`.

### 2. Upstream Proxy Dropping Inactive SSE Connections
- **Symptom**: Client connection terminates every 60 seconds with `net::ERR_INCOMPLETE_CHUNKED_ENCODING` or EOF.
- **Root Cause**: An intermediate firewall or load balancer detects no traffic across the TCP socket and issues a TCP RST packet.
- **Remedy**: Implement a periodic heartbeat background task on the server emitting an SSE comment frame (`: keep-alive\n\n`) every 15 seconds. Increase `proxy_read_timeout` in Nginx to `86400s`.

### 3. Session Routing Collisions in Multi-Tenant Environments
- **Symptom**: Multiple clients connected over SSE receive mismatched responses or cross-talk errors.
- **Root Cause**: The `/messages` POST endpoint fails to inspect the `Mcp-Session-Id` header or query parameter, broadcasting responses across the first active transport instance.
- **Remedy**: Maintain an internal session registry mapping unique session UUIDs to their corresponding transport writer streams.

## FAQ

### When should our team choose Stdio over SSE for an internal tool?
Choose Stdio if the tool executes locally on a developer's workstation alongside their IDE (Claude Code, Cursor, Antigravity) and requires local file system access, terminal execution, or local git operations. Choose SSE if the tool accesses shared enterprise databases, third-party APIs with centralized credentials, or shared team resources that run centrally.

### Can an MCP server support both Stdio and SSE concurrently in the same process?
While possible, running both transports within a single process instance is an anti-pattern. Stdio requires a dedicated 1:1 subprocess lifecycle tied to the parent client, whereas SSE operates as a long-running multi-client daemon. Our architecture exposes both transports in a single codebase but selects the active mode via runtime CLI flags (`--transport stdio` vs `--transport sse`).

### Why does MCP use HTTP POST for upstream messages instead of a full WebSocket?
Server-Sent Events combined with HTTP POST simplifies corporate firewall traversal, integrates with standard HTTP authorization headers (e.g., `Bearer` tokens), eliminates complex WebSocket framing handshakes, and allows standard HTTP caching and rate-limiting middleware to govern tool invocations.

### How does Claude handle transport reconnections when an SSE stream drops?
Compliant MCP clients track the last received event ID and automatically re-issue a `GET /sse` request. If the server supports session resumption, it reconnects the client to the active session state without requiring a full re-initialization sequence.
