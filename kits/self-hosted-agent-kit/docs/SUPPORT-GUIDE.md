# Self-Hosted Agent Infrastructure Kit — Support & Operations Runbook

This guide contains the operational runbook, diagnostic commands, disaster recovery procedures, and customer support playbook for the **Self-Hosted Agent Infrastructure Kit**.

---

## 1. Support Tiers & SLA Guidelines

| Tier | Description | Target Buyer | SLA | Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1 (Self-Service)** | Digital Download Buyers (€35) | Independent builders, hobbyists | Community / Docs | Full documentation, troubleshooting decision tree, automated diagnostics script. |
| **Tier 2 (Config Support)** | Standard Buyers with support ticket | Early startup founders, solo devs | 24 Hours | Asynchronous triage for SSL issues, port conflicts, or container startup errors. |
| **Tier 3 (Concierge)** | White-Glove Deployment (€350) | Agencies, busy engineers | 2 Hours (Business) | Full SSH provisioning, custom domain DNS setup, Telegram bot pairing, tailored guardrail rules. |

---

## 2. Emergency Diagnostics & One-Liner Triage

When a user reports that "the stack isn't working," run or advise them to run these commands in sequence:

### Step 1: Run the Automated Watchdog Audit
```bash
sudo /opt/agent-stack/scripts/watchdog.py
```
This tests Docker container health, PostgreSQL query ping, Redis ping, disk thresholds, and UFW firewall status in one command.

### Step 2: Check Running Containers
```bash
docker compose -f /opt/agent-stack/docker-compose.yml ps
```
- If any container shows `Restarting (x)` or `unhealthy`, inspect its logs:
  ```bash
  docker compose -f /opt/agent-stack/docker-compose.yml logs -n 50 [container-name]
  ```

### Step 3: Check System Resources
```bash
# Memory and swap usage
free -m

# Disk utilization
df -h /

# System load
uptime
```

---

## 3. Top 10 Buyer Issues & Resolution Playbook

### Issue 1: "I cannot connect to PostgreSQL (5432) or Redis (6379) from my laptop"
- **Cause:** By design, the kit does NOT expose database ports to `0.0.0.0` on the public internet. This prevents brute-force attacks and catastrophic credential stuffing.
- **Solution (Secure Tunneling):**
  1. **Option A (SSH Port Forwarding):**
     ```bash
     ssh -L 5432:localhost:5432 -L 6379:localhost:6379 user@vps-ip
     ```
     Now connect your local client (TablePlus, DBeaver, psql) to `localhost:5432`.
  2. **Option B (Tailscale Mesh VPN):**
     Run `./scripts/tailscale-setup.sh` on the VPS. Add both machines to the same tailnet; connect securely via the 100.x.y.z IP.

---

### Issue 2: "SSL certificate error / Caddy HTTPS handshake fails"
- **Cause:** ACME challenge cannot verify domain ownership.
- **Diagnostics:**
  ```bash
  docker compose -f /opt/agent-stack/docker-compose.yml logs caddy | grep -i error
  ```
- **Fixes:**
  1. **DNS Check:** Verify that your A record points to your VPS IP:
     ```bash
     dig +short agent.yourdomain.com
     ```
  2. **Cloudflare Orange Cloud:** If using Cloudflare, change SSL mode to **Full (Strict)** or temporarily grey-cloud the DNS record while Caddy obtains the initial certificate.
  3. **Port 80/443 Open:** Verify UFW permits ingress:
     ```bash
     sudo ufw status | grep -E '80|443'
     ```

---

### Issue 3: "Port 80 or 443 already in use during setup"
- **Cause:** An existing web server (Apache2, Nginx, Plesk, or Traefik) is already running on the VPS.
- **Diagnostics:**
  ```bash
  sudo lsof -i :80
  sudo lsof -i :443
  ```
- **Fixes:**
  - If Apache/Nginx was installed by default on the VPS image:
    ```bash
    sudo systemctl stop nginx apache2 2>/dev/null || true
    sudo systemctl disable nginx apache2 2>/dev/null || true
    sudo systemctl restart agent-stack.service
    ```
  - If you need to keep existing servers, rebind Caddy in `Caddyfile` to port `8443` or route traffic via the existing proxy.

---

### Issue 4: "Lost or forgotten database / Redis passwords"
- **Fix:**
  1. Passwords are saved in `/opt/agent-stack/.env`. View them securely:
     ```bash
     sudo cat /opt/agent-stack/.env | grep -E 'PASSWORD|SECRET'
     ```
  2. If the `.env` file was lost or corrupted, generate new credentials:
     ```bash
     NEW_PG_PW=$(openssl rand -hex 16)
     NEW_REDIS_PW=$(openssl rand -hex 16)
     echo "POSTGRES_PASSWORD=$NEW_PG_PW" | sudo tee -a /opt/agent-stack/.env
     echo "REDIS_PASSWORD=$NEW_REDIS_PW" | sudo tee -a /opt/agent-stack/.env
     sudo systemctl restart agent-stack.service
     ```

---

### Issue 5: "Locked out of VPS after configuring UFW firewall"
- **Cause:** UFW was enabled before allowing SSH port.
- **Prevention:** `scripts/setup.sh` automatically executes `ufw allow 22/tcp` before `ufw enable`.
- **Emergency Fix:**
  - Log into your VPS provider's web console (VNC / Out-of-band console).
  - Run:
    ```bash
    sudo ufw allow 22/tcp
    sudo ufw reload
    ```

---

### Issue 6: "Docker daemon fails or container in CrashLoopBackOff"
- **Diagnostics:**
  ```bash
  sudo journalctl -u docker.service -n 50 --no-pager
  ```
- **Common Fix:**
  Out of disk space or inode exhaustion. Run:
  ```bash
  df -h
  df -i
  ```
  If disk is >95% full, see **Pruning Docker Storage** below.

---

### Issue 7: "How do I safely prune Docker disk space without losing database data?"
- **Safety Guarantee:** Database data is stored in Docker Named Volumes (`agent-postgres-data`), NOT ephemeral container layers.
- **Pruning Command:**
  ```bash
  # Safely removes stopped containers, dangling images, and build cache
  docker system prune -af
  ```
  > [!CAUTION]
  > NEVER run `docker volume prune -a` unless you intend to completely destroy your persistent database.

---

### Issue 8: "ZeroVPS Guardrails blocked a legitimate maintenance command"
- **Cause:** A command triggered a safety rule (e.g. `rm -rf /opt/temp_build`).
- **Resolution:**
  1. Inspect the block reason in dashboard or logs:
     ```bash
     docker compose -f /opt/agent-stack/docker-compose.yml logs agent-runtime | grep GUARDRAIL
     ```
  2. If the command was intentional, execute it directly in host SSH rather than through the agent runtime API.
  3. Or add an exclusion path in `/opt/agent-stack/scripts/guardrails/rules.json`.

---

### Issue 9: "Watchdog sent a Telegram alert: Service agent-runtime is down"
- **Automated Behavior:** The watchdog automatically attempts to restart the failing container up to 3 times before entering cooldown.
- **Manual Check:**
  ```bash
  docker compose -f /opt/agent-stack/docker-compose.yml restart agent-runtime
  ```

---

### Issue 10: "How do I update the kit to the latest version?"
- **Update Workflow:**
  ```bash
  cd /opt/agent-stack
  git pull origin main
  docker compose pull
  docker compose up -d --build
  sudo systemctl restart agent-watchdog.timer
  ```

---

## 4. Backup & Disaster Recovery Procedures

### Running an Immediate Backup
```bash
sudo /opt/agent-stack/scripts/backup.sh
```
This produces a gzip-compressed PostgreSQL dump and Redis snapshot in `/opt/agent-stack/backups/agent-backup-YYYY-MM-DD-HHMM.tar.gz`.

### Restoring from Backup
1. Stop runtime writes:
   ```bash
   docker compose -f /opt/agent-stack/docker-compose.yml stop agent-runtime
   ```
2. Locate the backup archive:
   ```bash
   ls -lt /opt/agent-stack/backups/
   ```
3. Extract archive to a temp directory:
   ```bash
   tar -xzf /opt/agent-stack/backups/agent-backup-2026-10-07-1200.tar.gz -C /tmp/restore/
   ```
4. Restore PostgreSQL database:
   ```bash
   docker compose -f /opt/agent-stack/docker-compose.yml exec -T postgres dropdb -U postgres agentdb || true
   docker compose -f /opt/agent-stack/docker-compose.yml exec -T postgres createdb -U postgres agentdb
   cat /tmp/restore/postgres_dump.sql | docker compose -f /opt/agent-stack/docker-compose.yml exec -T postgres psql -U postgres agentdb
   ```
5. Restart the stack:
   ```bash
   sudo systemctl restart agent-stack.service
   ```

---

## 5. Customer Support Playbook & Response Templates

### Template 1: Domain / SSL Certificate Delay
```text
Hi [Name],

Thanks for reaching out! In 99% of cases, SSL initialization delays are caused by DNS propagation or Cloudflare proxy settings.

Please check two quick things:
1. Run `dig +short yourdomain.com` in your terminal to ensure it resolves to your VPS IP address.
2. If using Cloudflare, temporarily set the DNS record to "DNS Only" (grey cloud) so Caddy can complete the ACME HTTP-01 challenge with Let's Encrypt.

Once done, restart the proxy with:
`docker compose restart caddy`

Let me know what output you get if it doesn't resolve within 5 minutes!
```

### Template 2: Connecting External Clients to Postgres
```text
Hi [Name],

For security, the kit keeps PostgreSQL (5432) strictly bound to an internal Docker network, protecting your agent's memory from public internet port scanners.

To connect TablePlus, Cursor, or your local scripts:
Simply open an SSH tunnel from your laptop:
`ssh -L 5432:localhost:5432 user@your-vps-ip`

Then point your local client to:
`postgresql://postgres:PLACEHOLDER@127.0.0.1:5432/agentdb` (replace PLACEHOLDER with your actual password from .env)

Alternatively, if you use Tailscale, run `./scripts/tailscale-setup.sh` on your server for zero-config mesh connectivity.
```

### Template 3: Concierge Tier Welcome & Next Steps
```text
Hi [Name],

Welcome to the Concierge deployment! I will be personally setting up and hardening your 24/7 Agent Infrastructure Stack.

To get started, please reply with:
1. Your VPS public IP address and temporary SSH root access (or your public SSH key).
2. The domain or subdomain you want to use (e.g. agent.yourcompany.com).
3. (Optional) Your Telegram User ID if you want automated watchdog health alerts delivered to your phone.

We will complete provisioning, hardening, and test runs within 2 business hours.
```
