# Production Security & Hardening Checklist

Follow this checklist before running production workloads or autonomous agents with broad capabilities.

---

### 1. Firewall & Port Exposure
- [ ] **Default Deny:** Ensure UFW defaults to incoming deny (`ufw default deny incoming`).
- [ ] **Zero Database Exposure:** Confirm PostgreSQL (`5432`) and Redis (`6379`) are NOT bound to `0.0.0.0` on the host. In `docker-compose.yml`, they are isolated inside the `agent-net` Docker bridge.
- [ ] **SSH Hardening:** Disable password authentication in `/etc/ssh/sshd_config` (`PasswordAuthentication no`, `PubkeyAuthentication yes`). Change default SSH port to a non-standard port if subjected to bot scans.

### 2. Secrets & Credential Management
- [ ] **Git Exclusion:** Confirm `.env` is listed in `.gitignore` and has permissions restricted to `chmod 600 /opt/agent-stack/.env`.
- [ ] **Model Provider Spend Limits:** Set hard spend caps in OpenAI, Anthropic, or OpenRouter dashboards ($10–$50 limit on day one).
- [ ] **Least Privilege MCP Keys:** Give your MCP database user permissions strictly to the relevant tables; avoid running database operations as the `postgres` superuser.

### 3. Fail2ban & Intrusion Defense
- [ ] **Enable SSH Jail:** Ensure `fail2ban` service is running (`systemctl status fail2ban`).
- [ ] **Rate Limiting:** Caddy handles reverse proxy rate limits and drops abusive burst traffic before it hits the application runtime.

### 4. Backups & Disaster Recovery
- [ ] **Daily DB Snapshots:** Ensure `scripts/backup.sh` is scheduled in crontab:
  ```cron
  0 3 * * * /opt/agent-stack/scripts/backup.sh >> /var/log/agent-backup.log 2>&1
  ```
- [ ] **Offsite Sync:** Mirror `/opt/agent-stack/backups` to offsite S3 or MinIO storage.
