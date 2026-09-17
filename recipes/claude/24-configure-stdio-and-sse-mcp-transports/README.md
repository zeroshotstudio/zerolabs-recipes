# Recipe 24: Configure Stdio and SSE Transports in MCP

A dual-transport reference implementation demonstrating Model Context Protocol (MCP) servers with standard I/O (`stdio`) and Server-Sent Events (`SSE`) / HTTP streaming across Python and TypeScript.

## Architecture

Model Context Protocol (MCP) clients communicate with servers through well-defined transport abstractions:

1. **Stdio Transport**: Subprocess lifecycle communication over stdin and stdout. Zero networking overhead, ideal for local desktop tools and editor integration (Cursor, Claude Code, Antigravity).
2. **Server-Sent Events (SSE) Transport**: HTTP-based streaming communication over `/sse` streams and `/messages` POST routes. Enables remote hosting, centralized enterprise tools, reverse proxying through Nginx, and multi-tenant agent execution.

## Directory Layout

```
24-configure-stdio-and-sse-mcp-transports/
├── .env.example
├── README.md
├── metadata.json
├── curl_probe.sh
├── python/
│   ├── requirements.txt
│   └── server_sse.py
└── typescript/
    ├── package.json
    ├── tsconfig.json
    └── src/
        └── server_sse.ts
```

## Quickstart

### Python Implementation

```bash
cd python
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run as SSE server on port 8000
python3 server_sse.py --transport sse --host 127.0.0.1 --port 8000

# Run in Stdio mode
python3 server_sse.py --transport stdio
```

### TypeScript Implementation

```bash
cd typescript
npm install
npm run build

# Run as SSE server
npm run dev:sse

# Run in Stdio mode
npm run dev:stdio
```

## Verification

In a separate terminal window, run the automated verification probe against the live SSE server:

```bash
./curl_probe.sh
```

Or manually probe using cURL:

```bash
# 1. Open SSE stream
curl -N -H "Accept: text/event-stream" http://127.0.0.1:8000/sse

# 2. Dispatch JSON-RPC initialize payload to the message endpoint
curl -X POST http://127.0.0.1:8000/messages \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "curl-client", "version": "1.0.0"}
    }
  }'
```
