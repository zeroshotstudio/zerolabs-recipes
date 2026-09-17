# Recipe 26: Implement Remote MCP Servers and Secure Tunnels

Production implementation of remote Model Context Protocol (MCP) servers exposed over HTTPS and Server-Sent Events (SSE), secured with Bearer token authentication, Nginx reverse proxy buffering controls, and zero-trust tunnels (Cloudflare Tunnels, Tailscale Funnel).

## Architecture

```
[Claude Desktop / Client] 
           │
           │ HTTPS + SSE (Bearer Token)
           ▼
[Edge Tunnel / Reverse Proxy] (Cloudflare Tunnel / Tailscale Funnel / Nginx)
           │ (proxy_buffering off; chunked_transfer_encoding off)
           ▼
[Remote MCP Server] (Starlette / Express SSE Transport)
           ├── GET  /sse        (Initiates stream, generates sessionId)
           ├── POST /messages/  (Routes JSON-RPC payloads to active session)
           └── GET  /health     (Infrastructure liveness probe)
```

## Features

- **Bearer Token Auth**: Constant-time comparison (`secrets.compare_digest` in Python, `crypto.timingSafeEqual` in TypeScript) to prevent timing attacks.
- **SSE Stream Configuration**: Full Nginx reverse proxy configuration disabling proxy buffering and chunked transfer encoding for real-time delivery.
- **Dual Runtime Reference**: Complete implementations in both Python (FastMCP + Starlette) and TypeScript (@modelcontextprotocol/sdk + Express).
- **Automated Verification Probe**: `curl_probe.sh` script validating health, 401 unauthenticated rejection, and authenticated SSE stream initialization.

## Quickstart

### 1. Environment Setup
```bash
cp .env.example .env
```

### 2. Python Server
```bash
pip install "mcp>=1.2.0" starlette uvicorn
python python/remote_server.py
```

### 3. TypeScript Server
```bash
cd typescript
npm install
npm run dev
```

### 4. Reverse Proxy Setup (Nginx)
Copy `nginx/mcp.conf` to `/etc/nginx/sites-available/` and create a symlink to `/etc/nginx/sites-enabled/`. Ensure `proxy_buffering off;` is active.

### 5. Verify Setup
Run the automated probe:
```bash
./curl_probe.sh http://127.0.0.1:8000 default-insecure-dev-token-change-in-production
```

## Client Configuration

Add the remote server to your client configuration (e.g., Claude Desktop or custom MCP orchestrator):

```json
{
  "mcpServers": {
    "remote-ops": {
      "url": "https://mcp.yourdomain.com/sse",
      "headers": {
        "Authorization": "Bearer your-high-entropy-shared-bearer-token-secret-min32chars"
      }
    }
  }
}
```
