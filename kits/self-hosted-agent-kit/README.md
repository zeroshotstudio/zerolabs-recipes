# Self-Hosted Agent Infrastructure Kit ⚡
### Production-Hardened Autonomous AI Agent Stack with ZeroVPS Guardrails

> **Turnkey, production-hardened infrastructure templates to run autonomous AI agents 24/7 on a cheap ($5–$10/mo) Ubuntu VPS with zero vendor lock-in, unbuffered SSE streaming, automated backups, and strict execution guardrails.**

Designed for AI engineers, founders, and vibe coders running autonomous agents (OpenClaw, Claude Code CLI, Cursor, Antigravity, or custom Node/Python runners) who need rock-solid reliability, predictable hosting costs, and hardened multi-container architecture.

---

## 📦 What Exactly Are You Buying?

When you purchase the **Self-Hosted Agent Infrastructure Kit**, you receive a production-tested, turnkey infrastructure package ready to deploy onto any Ubuntu 22.04 or 24.04 LTS VPS (Hetzner, DigitalOcean, Linode, AWS Lightsail, etc.).

### The 7 Core Deliverables:

| # | Deliverable | Technology | What It Does For You |
|---|---|---|---|
| **1** | **Multi-Container Production Stack** | Docker Compose | Isolated bridge network running **Node.js 22 LTS**, **PostgreSQL 17.11**, **Redis 7.4.11**, and **Caddy 2.11**. One `docker compose up` brings up your entire agent backend. |
| **2** | **Modern Agent Operations Dashboard** | Vanilla JS + HTML5 (Zero Bloat) | High-aesthetic Linear/Vercel-style dark HUD. Provides live SSE token streaming visualizer, real-time throughput gauge (`tok/sec`), container health telemetry, and PostgreSQL 17 task ledger. |
| **3** | **ZeroVPS Guardrails Security Suite** | Bash + Pattern Matchers | Active defense scripts (`validate-bash.sh`, `validate-db-safety.sh`, `validate-backup-freshness.sh`) that shield your host and database from accidental destructive agent commands (`rm -rf`, `DROP TABLE`). |
| **4** | **Unbuffered Streaming Reverse Proxy** | Caddy 2 Alpine | Automated Let's Encrypt / ZeroSSL TLS with `flush_interval -1` to eliminate proxy buffering lag on real-time Server-Sent Events (SSE) and WebSocket model streams. |
| **5** | **Zero-Public-Port Tailscale Mesh** | Tailscale WireGuard | Automated helper (`tailscale-setup.sh`) allowing you to run your agent infrastructure completely hidden behind private WireGuard mesh—zero open ports visible on Shodan. |
| **6** | **Self-Healing Incident Watchdog** | Python 3 + systemd | Autonomous background daemon monitoring container status, memory leaks, and restart flapping every 5 minutes, dispatches instant Markdown alerts to Telegram. |
| **7** | **Zero-Downtime Backup Engine** | Bash + pg_dump | Scheduled database and cache snapshots with automated 7-day retention pruning and offsite cloud storage hooks (S3/R2/MinIO). |

---

## 🛠️ Stack Component Versions

We only use the latest stable, production-ready versions:
* **Database:** PostgreSQL `17-alpine` (PostgreSQL 17.11) with persistent volume storage.
* **Cache & Queue:** Redis `7-alpine` (Redis 7.4.11) with Append-Only File (AOF) persistence.
* **Reverse Proxy:** Caddy `2-alpine` (Caddy 2.11.7) with HTTP/2, HTTP/3, and modern cipher suites.
* **Runtime:** Node.js `22-alpine` (Node 22 LTS).
* **Host Compatibility:** Ubuntu 22.04 LTS & Ubuntu 24.04 LTS.

---

## 📁 Repository & Package Structure

```text
self-hosted-agent-kit/
├── docker-compose.yml              # Production 4-container stack definition
├── Caddyfile                       # Reverse proxy with unbuffered SSE & security headers
├── .env.example                    # Environment credentials & alert configuration
├── LICENSE                         # Commercial Single-Operator License
├── README.md                       # Comprehensive kit guide & architecture overview
├── app/
│   ├── Dockerfile                  # Lightweight Node 22 Alpine runtime
│   ├── package.json                # Minimal dependencies (pg, ioredis)
│   └── server.js                   # High-aesthetic operations dashboard & streaming API
├── scripts/
│   ├── setup.sh                    # 1-command installer script for Ubuntu
│   ├── backup.sh                   # Automated PostgreSQL 17 & Redis backup routine
│   ├── watchdog.py                 # Self-healing supervisor with Telegram alerts
│   ├── tailscale-setup.sh          # Zero-public-port WireGuard mesh configurator
│   └── guardrails/
│       ├── validate-bash.sh        # Shell guardrail blocking destructive commands
│       ├── validate-db-safety.sh   # SQL guardrail intercepting accidental table drops
│       └── validate-backup-freshness.sh # Gate requiring fresh backups before updates
├── systemd/
│   ├── agent-stack.service         # Ensures stack persists across host reboots
│   ├── agent-watchdog.service      # Triggers watchdog health inspection
│   └── agent-watchdog.timer        # 5-minute systemd timer unit
├── mcp/
│   └── mcp-config.json             # Model Context Protocol schemas for Claude & Cursor
└── docs/
    ├── QUICKSTART.md               # 15-minute deployment runbook
    ├── HARDENING-CHECKLIST.md      # Linux host & firewall security checklist
    └── ZEROVPS-FEATURES.md         # Deep-dive into ZeroVPS operational guardrails
```

---

## 🚀 Quick Start (Deploy in Under 10 Minutes)

### 1. Unpack & Run the Installer
On your fresh Ubuntu 22.04 or 24.04 VPS:
```bash
git clone https://github.com/zeroshotstudio/zerolabs-recipes.git
cd zerolabs-recipes/kits/self-hosted-agent-kit
sudo ./scripts/setup.sh
```

### 2. Configure Environment
Edit `.env` to configure your domain and Telegram bot for incident notifications:
```bash
nano .env
```

### 3. Start the Stack
```bash
sudo systemctl start agent-stack.service
```

### 4. Verify Live Status
Visit your domain or Tailscale URL to access the live modern operations dashboard. Test real-time SSE token streaming and inspect persistent tasks committed directly into PostgreSQL 17.

---

## 🔒 Security & Architecture Guarantees

1. **Zero Open Ports (Optional):** Run behind Tailscale so no HTTP/HTTPS ports are visible on public IP ranges.
2. **Crash Resilience:** If a container crashes, Docker restarts it. If the server reboots, `agent-stack.service` recovers the full stack.
3. **Data Durability:** All PostgreSQL transactions are committed to persistent volume `pgdata`. Redis operates with `appendonly yes`. Daily snapshots are gzipped and retained for 7 days.
4. **Execution Boundaries:** The included ZeroVPS guardrail scripts prevent autonomous AI agents with shell or database privileges from accidentally running destructive commands.

---

## 📄 License & Commercial Rights

Purchasing this kit grants you a **Commercial Single-Operator License**. You are licensed to deploy, modify, and run this infrastructure for unlimited personal, client, and commercial agent projects. Redistribution or reselling of the raw templates is prohibited.

Created by Jimmy Goode · ZeroShot Studio  
[labs.zeroshot.studio](https://labs.zeroshot.studio)
