# Self-Hosted Agent Infrastructure Kit ⚡

> **Turnkey, production-hardened infrastructure templates to self-host autonomous AI agents on Ubuntu VPS in under 15 minutes.**

Designed for engineers and vibe coders running autonomous agents (OpenClaw, Claude Code, Cursor, Antigravity, custom Python/Node runners) who want zero vendor lock-in, predictable monthly costs, and hardened multi-container architecture.

---

## What’s Inside the Kit

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Container Topology** | Docker Compose | Isolated bridge network running Agent Runtime, Postgres 16, Redis 7, and Caddy 2 |
| **Reverse Proxy** | Caddy 2 | Automatic HTTPS, modern TLS, rate limiting, and zero-buffering SSE streaming support |
| **System Supervision** | systemd | Auto-restart on failure, reboot persistence, and graceful shutdown handling |
| **Incident Watchdog** | Python 3 + Telegram | Periodic health audits, container recovery, memory checks, and Telegram webhook alerts |
| **Zero-Downtime Backups** | Bash + pg_dump | Scheduled database and cache snapshots with automatic 7-day retention pruning |
| **Tool Calling Bridge** | Model Context Protocol | Production MCP config connecting agents to local database and filesystem tools |
| **Hardening Checklist** | Linux Security | Firewall rules (UFW), fail2ban configuration, and least-privilege credentials |

---

## Directory Structure

```text
├── docker-compose.yml          # Multi-container production stack definition
├── Caddyfile                   # Reverse proxy with TLS & SSE streaming tweaks
├── .env.example                # Complete environment and credential template
├── LICENSE                     # Commercial Single-Operator License
├── README.md                   # Kit overview and architectural guide
├── systemd/
│   ├── agent-stack.service     # Supervises Docker Compose across reboots
│   ├── agent-watchdog.service  # Executes automated health audits
│   └── agent-watchdog.timer    # 5-minute systemd timer trigger
├── scripts/
│   ├── setup.sh                # 1-command installer script for Ubuntu
│   ├── watchdog.py             # Incident detection & Telegram alerting engine
│   └── backup.sh               # Automated database & state backup routine
├── mcp/
│   └── mcp-config.json         # Standard MCP bridge schema for Cursor/Claude/OpenClaw
└── docs/
    ├── QUICKSTART.md           # 15-minute deployment walkthrough
    └── HARDENING-CHECKLIST.md  # Production security and firewall audit list
```

---

## Quick Start

1. Clone or unpack the kit onto your Ubuntu 22.04 or 24.04 LTS VPS:
   ```bash
   sudo ./scripts/setup.sh
   ```
2. Populate `/opt/agent-stack/.env` with your domain and Telegram bot credentials.
3. Start the stack:
   ```bash
   sudo systemctl start agent-stack.service
   ```

For detailed step-by-step instructions, see [`docs/QUICKSTART.md`](docs/QUICKSTART.md).

---

© ZeroShot Studio. Created by Jimmy Goode.
