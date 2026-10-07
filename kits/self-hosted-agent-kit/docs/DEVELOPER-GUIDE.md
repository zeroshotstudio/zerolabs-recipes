# Self-Hosted Agent Infrastructure Kit — Developer Guide

This developer guide provides architectural documentation, API specifications, database schemas, and integration recipes for developers and engineers building, extending, or integrating autonomous agents with the **Self-Hosted Agent Infrastructure Stack**.

---

## 1. System Architecture & Topology

The kit is architected as an isolated, self-healing microservices mesh orchestrated via Docker Compose and governed by systemd.

```
                  ┌────────────────────────────────────────────────────────┐
                  │                      Public Internet                   │
                  └───────────────────────────┬────────────────────────────┘
                                              │ Port 80, 443
                                              ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Host VPS (Ubuntu 22.04 / 24.04 LTS) — UFW Hardened (Ports 22, 80, 443 only)             │
│                                                                                          │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Caddy 2.8 Reverse Proxy (Auto Let's Encrypt SSL / HTTP3 / Rate-Limiting / Gzip)   │  │
│  └───────────────────────────────────┬────────────────────────────────────────────────┘  │
│                                      │ http://agent-runtime:3000                         │
│                                      ▼                                                   │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ agent-runtime (Node.js 22 LTS)                                                     │  │
│  │ ├─ Web Operations Dashboard (Glassmorphism HUD, Quick Connect Portal)              │  │
│  │ ├─ ZeroVPS Guardrail Engine (Command Interception & AST Blacklisting)              │  │
│  │ ├─ REST & SSE Streaming Endpoints (/api/stream, /api/agent/*)                     │  │
│  │ └─ Framework Dispatchers (Antigravity, Claude, OpenAI, Cursor, Python, Node)       │  │
│  └──────────────────┬─────────────────────────────────┬───────────────────────────────┘  │
│                     │                                 │                                  │
│   Private Docker    │ postgres:5432                   │ redis:6379                       │
│   Network           ▼                                 ▼                                  │
│   (agent-net) ┌───────────────────────────┐     ┌───────────────────────────┐            │
│               │ PostgreSQL 17 Alpine      │     │ Redis 7.4 Alpine          │            │
│               │ - Persistent Memory       │     │ - Distributed Task Queues │            │
│               │ - Task History & Logs     │     │ - Pub/Sub Event Bus       │            │
│               │ - Vector-Ready Schema     │     │ - Distributed Mutex Locks │            │
│               └───────────────────────────┘     └───────────────────────────┘            │
│                               ▲                               ▲                          │
│                               └───────────────┬───────────────┘                          │
│                                               │ Internal Network                         │
│                               ┌───────────────┴───────────────┐                          │
│                               │ Custom Autonomous Agents      │                          │
│                               │ (Python / CrewAI / AutoGen)   │                          │
│                               └───────────────────────────────┘                          │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### Network Isolation Principle
- **Zero Exposed Database Ports:** Neither PostgreSQL (`5432`) nor Redis (`6379`) bind to `0.0.0.0` or public host interfaces. They communicate exclusively over the internal Docker bridge network (`agent-net`).
- **External Ingress:** All HTTP/HTTPS traffic terminates at Caddy. Caddy handles automatic TLS certificate provisioning via Let's Encrypt and forwards authorized requests to `agent-runtime:3000`.
- **Remote Developer Access:** Developers who need direct GUI access to PostgreSQL (e.g. via TablePlus, DBeaver, or psql) must connect via Tailscale private IP or an encrypted SSH tunnel:
  ```bash
  ssh -L 5433:localhost:5432 user@vps-ip
  ```

---

## 2. Database Schema & Data Models

The stack automatically boots PostgreSQL 17 with pre-initialized tables inside `agentdb`.

### Core Tables

#### `agent_tasks`
Stores all dispatched agent runs, execution metadata, safety verification status, and output logs:

```sql
CREATE TABLE IF NOT EXISTS agent_tasks (
    id SERIAL PRIMARY KEY,
    prompt TEXT NOT NULL,
    output TEXT,
    safety_status VARCHAR(50) DEFAULT 'PASSED',
    framework VARCHAR(50) DEFAULT 'generic',
    session_id VARCHAR(100),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_created_at ON agent_tasks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_framework ON agent_tasks (framework);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_safety ON agent_tasks (safety_status);
```

#### `agent_registry`
Maintains a heartbeat registry of active connected agents across frameworks:

```sql
CREATE TABLE IF NOT EXISTS agent_registry (
    agent_id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    framework VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'online',
    last_ping TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);
```

---

## 3. Redis Queue Protocol & Event Bus

The kit leverages Redis 7.4 for asynchronous task distribution and event streaming.

### Key Data Structures
- `agent:tasks` (List / FIFO Queue): Agents pop JSON payloads using `BLPOP agent:tasks 0`.
- `agent:results:{taskId}` (String with TTL 86400s): Stores task output payloads.
- `agent:events` (Pub/Sub Channel): Emits live telemetry events to the dashboard SSE stream.

### Task Payload Specification
```json
{
  "id": "task_1728345600000",
  "framework": "antigravity",
  "prompt": "Analyze repository health and generate changelog",
  "created_at": "2026-10-07T21:00:00.000Z",
  "environment": {
    "timeout_seconds": 300,
    "sandbox_mode": true
  }
}
```

---

## 4. REST & SSE API Reference

The `agent-runtime` daemon exposes a unified REST API on port `3000` (proxied via Caddy).

### 1. Health & Stack Status
- **Endpoint:** `GET /api/health`
- **Response:**
  ```json
  {
    "status": "healthy",
    "timestamp": "2026-10-07T21:00:00.000Z",
    "services": {
      "postgres": "connected",
      "redis": "connected",
      "guardrails": "active"
    },
    "version": "1.2.0"
  }
  ```

### 2. Live Telemetry Stream (SSE)
- **Endpoint:** `GET /api/stream`
- **Protocol:** Server-Sent Events (`text/event-stream`)
- **Events:**
  - `metrics`: Emits CPU, Memory, Disk, and container status every 2 seconds.
  - `task_dispatched`: Triggered when an agent receives a job.
  - `task_completed`: Triggered when an execution finishes.
  - `guardrail_alert`: Triggered when a destructive command is blocked.

### 3. Agent Heartbeat Ping
- **Endpoint:** `POST /api/agent/ping`
- **Payload:**
  ```json
  {
    "agentId": "antigravity-worker-01",
    "name": "Google Antigravity Agent",
    "framework": "antigravity",
    "status": "idle"
  }
  ```
- **Response:** `{"success": true, "message": "Agent registered/updated"}`

### 4. Agent Task Dispatch
- **Endpoint:** `POST /api/agent/dispatch`
- **Headers:** `Content-Type: application/json`
- **Payload:**
  ```json
  {
    "framework": "claude",
    "prompt": "Run database migration for agent memory vector index",
    "sessionId": "sess_abc123"
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "taskId": 42,
    "framework": "claude",
    "status": "DISPATCHED",
    "safetyStatus": "PASSED"
  }
  ```

### 5. ZeroVPS Guardrail Evaluation
- **Endpoint:** `POST /api/guardrail-test`
- **Payload:** `{"command": "rm -rf / --no-preserve-root"}`
- **Response (Blocked):**
  ```json
  {
    "allowed": false,
    "status": "BLOCKED",
    "reason": "Destructive filesystem wipe pattern detected (rm -rf /)"
  }
  ```

---

## 5. Frontier AI Integration Recipes

### A. Google Antigravity (AGY) Integration
Google Antigravity agents can connect directly via Model Context Protocol or CLI rules.

1. **MCP Configuration (`templates/antigravity_mcp.json`):**
   ```json
   {
     "mcpServers": {
       "agent-postgres": {
         "command": "npx",
         "args": [
           "-y",
           "@modelcontextprotocol/server-postgres",
           "postgresql://postgres:PLACEHOLDER@vps.example.com:5432/agentdb"
         ]
       }
     }
   }
   ```
2. **Rule Directive:** Add to `.antigravity/rules` or `AGENTS.md`:
   ```markdown
   - Persistent State: Query PostgreSQL `agent_tasks` before beginning complex multi-step work.
   - Queue Dispatch: Push asynchronous long-running subagent tasks to Redis `agent:tasks`.
   - Security Boundary: Respect ZeroVPS Guardrails; never execute bare destructive shell wipes.
   ```

### B. Anthropic Claude Code & Claude Desktop
1. Locate your Claude configuration:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
2. Add the PostgreSQL MCP server:
   ```json
   {
     "mcpServers": {
       "agent-postgres": {
         "command": "npx",
         "args": [
           "-y",
           "@modelcontextprotocol/server-postgres",
           "postgresql://postgres:PLACEHOLDER@agent.example.com:5432/agentdb"
         ]
       }
     }
   }
   ```
3. Restart Claude Desktop. Claude now possesses direct SQL introspection into your VPS memory!

### C. OpenAI Agents SDK & Codex
Python-native integration using the OpenAI Assistants/Agents API:

```python
import os, json, psycopg2
from openai import OpenAI

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
conn = psycopg2.connect(os.environ.get("DATABASE_URL"))

def execute_agent_task(prompt: str):
    # Log task start in agentdb
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO agent_tasks (prompt, framework, safety_status) VALUES (%s, %s, %s) RETURNING id;",
            (prompt, "openai", "PASSED")
        )
        task_id = cur.fetchone()[0]
        conn.commit()
    
    # Run completion or assistant
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}]
    )
    result = response.choices[0].message.content

    # Save output back to persistent memory
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE agent_tasks SET output = %s, completed_at = NOW() WHERE id = %s;",
            (result, task_id)
        )
        conn.commit()
    return result
```

### D. Cursor & Windsurf AI IDEs
Drop the following into your workspace `.cursor/mcp.json` or `.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "vps-stack": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://postgres:PLACEHOLDER@agent.example.com:5432/agentdb"
      ]
    }
  }
}
```

---

## 6. Extending with Custom Agent Containers

To add your own custom 24/7 worker container to the stack:

1. Create your agent directory: `agents/my-worker/`
2. Write a `Dockerfile`:
   ```dockerfile
   FROM python:3.11-slim
   WORKDIR /app
   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt
   COPY . .
   CMD ["python", "worker.py"]
   ```
3. Add the service to `docker-compose.yml`:
   ```yaml
     custom-worker:
       build: ./agents/my-worker
       container_name: custom-worker
       restart: unless-stopped
       environment:
         - DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB} # PLACEHOLDER
         - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379 # PLACEHOLDER
       networks:
         - agent-net
       depends_on:
         postgres:
           condition: service_healthy
         redis:
           condition: service_healthy
   ```
4. Build and start:
   ```bash
   docker compose up -d --build custom-worker
   ```

---

## 7. ZeroVPS Guardrail Architecture & Rule Extensions

The guardrail engine intercepts shell commands and API actions before execution.

### Rule Hierarchy
1. **Critical FS Wipes:** Blocks `rm -rf /`, `mkfs`, `dd if=/dev/zero`, block-device overwrites.
2. **Fork Bomb & Resource Denial:** Blocks `:(){ :|:& };:`, unbounded infinite memory allocations.
3. **Network Exfiltration of Secrets:** Blocks `curl ... | bash` targeting unverified remote scripts and dumping `.env` contents to external webhooks.
4. **Firewall & Security Tampering:** Blocks disabling UFW or stopping the watchdog daemon from non-root sessions.

### Custom Rule Extension
Edit `scripts/guardrails/rules.json`:
```json
{
  "blocked_patterns": [
    "DROP DATABASE",
    "TRUNCATE agent_tasks",
    "chmod 777 -R /"
  ],
  "allowed_overrides": [
    "ALLOW_MAINTENANCE_WINDOW"
  ]
}
```
Reload rules without downtime:
```bash
docker compose restart agent-runtime
```
