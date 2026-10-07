# ZeroVPS Hardening & Operational Features 🛡️

The **Self-Hosted Agent Infrastructure Kit** incorporates the battle-tested operational guardrails and automation patterns from ZeroVPS. Running autonomous agents on a server is fundamentally different from hosting static web applications: agents make dynamic API calls, generate code, write files, and execute shell commands. Without strict infrastructure boundaries, a rogue or hallucinating agent can delete production databases, fill disks, expose API secrets, or hang background processes.

ZeroVPS adds an active defense and supervision layer around your containers.

---

## 1. ZeroVPS Autonomous Guardrails Suite (`scripts/guardrails/`)

Autonomous agents operating via CLI or MCP tools must have pre-execution guardrails. The kit provides three standalone validation hooks:

### A. Shell Command Shield (`validate-bash.sh`)
* **Purpose:** Inspects shell strings before they reach `/bin/bash` or `/bin/sh`.
* **Blocked Signatures:**
  * Destructive deletes: `rm -rf /`, `rm -rf /*`, `rm -rf ~`, `rm -rf $HOME`
  * Raw disk block writes: `dd if=... of=/dev/sd*`, `> /dev/sd*`, `mkfs.*`
  * Permission destruction: `chmod -R 777 /`
  * Credential exfiltration: dumping `/etc/shadow` or unvetted private key files
  * Process nuking: `pkill -9` or `killall -9` against core runtimes (docker, systemd, python)
  * Fork bombs: `:( ) { :|:& };:`
* **Exit Codes:** Returns `101` on violation with error details, `0` when safe.

### B. Database Mutation Interceptor (`validate-db-safety.sh`)
* **Purpose:** Intercepts SQL queries and migration scripts before execution against PostgreSQL 17.
* **Blocked Operations:**
  * `DROP DATABASE`
  * `DROP TABLE`
  * `DROP SCHEMA`
  * `TRUNCATE TABLE`
  * Unconstrained `DELETE FROM` without `WHERE` clauses
* **Override Policy:** Strictly requires setting `ALLOW_DESTRUCTIVE_DB=1` to allow intentional schema drops.

### C. 24-Hour Backup Freshness Gate (`validate-backup-freshness.sh`)
* **Purpose:** Ensures an automated database snapshot exists within the last 24 hours before allowing risky system updates or package upgrades.
* **Enforcement:** Audits `./backups/postgres_*.sql.gz`. If no backup exists or the newest is older than 24h, the script returns `105` and prompts the agent or operator to run `./scripts/backup.sh`.

---

## 2. Zero-Public-Port Production (Tailscale WireGuard Mesh)

The standard web exposes ports 80 and 443 to the open internet, leaving servers vulnerable to automated port scanners (Shodan, Censys) and brute-force attacks.

* **Tailscale Mesh Architecture:** Using `scripts/tailscale-setup.sh`, your agent stack runs entirely inside your encrypted WireGuard private mesh (`*.ts.net`).
* **Zero Public Ports:** All incoming traffic from the public internet is dropped by UFW. Only authenticated devices in your private Tailnet can access the web dashboard, API, and streaming sockets.
* **Mobile & Remote Access:** Access the dashboard securely from iOS Safari, Android, or laptop anywhere in the world with full HTTPS TLS termination without exposing public DNS records.

---

## 3. Autonomous Supervisor Watchdog (`scripts/watchdog.py`)

A standalone Python supervisor triggered every 5 minutes by systemd (`agent-watchdog.timer`).

* **Container Health Audits:** Checks `docker ps` for all 4 containers (`agent-caddy`, `agent-runtime`, `agent-postgres`, `agent-redis`).
* **System Pressure Gates:** Alerts if disk utilization exceeds 88% or host RAM exceeds 92%.
* **Flapping / Restart-Loop Prevention:** Identifies containers stuck in restart loops before memory leaks impact the VPS host.
* **Telegram Webhook Dispatches:** Automatically formats and delivers Markdown incident alerts to your private Telegram chat with host uptime, failing container names, and recommended triage actions.

---

## 4. Zero-Downtime Automated Backup Routine (`scripts/backup.sh`)

* **PostgreSQL 17 Consistent Dumps:** Uses `docker exec agent-postgres pg_dumpall` piped to `gzip` for non-blocking snapshot creation.
* **Redis AOF & Snapshot Sync:** Triggers `bgsave` and copies point-in-time `.rdb` state.
* **Automated Retention Pruning:** Deletes snapshots older than 7 days to preserve VPS disk capacity.
* **Offsite Ready:** Pre-configured hook points for automated sync to AWS S3, Cloudflare R2, or MinIO via `rclone`.

---

## 5. Universal Model Context Protocol (MCP) Bridge (`mcp/`)

Pre-configured JSON schemas enabling LLM agents to communicate with your self-hosted infrastructure through structured tool calls instead of arbitrary bash commands:
* Inspect database schemas and query records safely.
* Check Redis queues and cache health.
* Query container logs and status without granting root shell access.
