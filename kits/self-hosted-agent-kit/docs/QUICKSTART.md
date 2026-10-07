# Quickstart: 15-Minute Zero-to-Production Agent Stack

This guide walks you through deploying the **Self-Hosted Agent Infrastructure Stack** on a clean Ubuntu 22.04 or 24.04 LTS instance (Hetzner, DigitalOcean, Linode, AWS EC2, or bare metal).

---

## 1. Prerequisites

- A fresh Ubuntu VPS (2 vCPU, 4GB RAM minimum; 4 vCPU, 8GB RAM recommended).
- A domain name with an A record pointing to your server's public IP (e.g. `agent.example.com`).
- Root or `sudo` SSH access.

---

## 2. One-Line Bootstrap

SSH into your server and run the automated setup script:

```bash
git clone https://github.com/zeroshotstudio/self-hosted-agent-kit.git /opt/agent-kit
cd /opt/agent-kit
sudo ./scripts/setup.sh
```

The script automatically:
1. Installs Docker Engine and the Docker Compose plugin.
2. Configures the UFW firewall (permits SSH on 22, HTTP on 80, HTTPS on 443; drops all other incoming ports).
3. Generates high-entropy cryptographic passwords for PostgreSQL and Redis.
4. Registers systemd units for auto-healing on system reboot and watchdog health monitoring.

---

## 3. Configure Your Domain & Telemetry

Edit `/opt/agent-stack/.env`:

```bash
sudo nano /opt/agent-stack/.env
```

Update the following keys:
- `APP_DOMAIN`: Your public hostname (e.g. `agent.yourdomain.com`).
- `ACME_EMAIL`: Your email for automatic Let's Encrypt SSL certificates.
- `TELEGRAM_BOT_TOKEN`: Your Telegram bot token (from `@BotFather`).
- `TELEGRAM_CHAT_ID`: Your personal or team chat ID for alerts.

---

## 4. Launch Stack & Verify

Start the stack via systemd:

```bash
sudo systemctl start agent-stack.service
```

Verify running containers:

```bash
docker compose -f /opt/agent-stack/docker-compose.yml ps
```

Expected output:
```text
NAME             IMAGE              STATUS                   PORTS
agent-caddy      caddy:2-alpine     Up (healthy)             0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
agent-postgres   postgres:17-alpine Up (healthy)             5432/tcp
agent-redis      redis:7-alpine     Up (healthy)             6379/tcp
agent-runtime    node:22-alpine     Up (healthy)             
```

---

## 5. Verify the Watchdog

Test the watchdog manually to confirm Telegram alerting:

```bash
sudo /opt/agent-stack/scripts/watchdog.py
```

You should see:
```text
[WATCHDOG] Executing stack health audit...
[WATCHDOG OK] All services, containers, and resources healthy.
```

The watchdog automatically runs every 5 minutes in the background via `systemd/agent-watchdog.timer`. If any container dies or memory spikes, you will receive an alert in Telegram immediately.

---

## 6. One-Click Connect Your Agents (Zero YAML Editing)

You don't need to manually configure Docker networks or craft database connection strings.

### Option A: From the Web Operations Dashboard
1. Open your dashboard in your browser (e.g. `https://agent.yourdomain.com`).
2. Go to the **⚡ ONE-CLICK AGENT QUICK CONNECT** hub at the top of the workspace.
3. Select your framework:
   - **🟣 Claude Code / Claude Desktop:** Click **"Download claude_desktop_config.json"** or copy the pre-filled MCP snippet.
   - **🔵 Cursor / Windsurf AI IDE:** Click **"Download .mcp.json"** and place it into your `.cursor/` folder.
   - **🐍 Python (LangChain / CrewAI):** Click **"Download agent_starter.py"** and run `python3 agent_starter.py`.
   - **🟩 Node.js / OpenClaw:** Click **"Download agent_starter.js"** and run `node agent_starter.js`.
   - **⚡ No-Code Webhooks (n8n / Make / Zapier):** Copy your universal endpoint `POST https://agent.yourdomain.com/api/agent/dispatch`.
4. Click **"⚡ Send One-Click Test Ping"** to verify round-trip connectivity live in the browser!

### Option B: From the Terminal
Run the interactive connection helper:
```bash
./scripts/quick-connect.sh
```
Or run the 1-line curl installer:
```bash
curl -fsSL https://agent.yourdomain.com/connect.sh | bash
```

