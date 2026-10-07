#!/usr/bin/env python3
"""
Agent Stack Watchdog & Incident Monitor
Monitors Docker containers, disk space, memory, and HTTP endpoints.
Dispatches instant alert notifications to Telegram on failures.
"""

import json
import os
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
from typing import Dict, List, Optional

# Auto-load .env from stack directory if present
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
if os.path.exists(env_path):
    with open(env_path, "r") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip("'").strip('"')
                if k not in os.environ:
                    os.environ[k] = v

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
HEALTHCHECK_URL = os.environ.get("HEALTHCHECK_URL", "").strip()
REQUIRED_CONTAINERS = [
    "agent-caddy",
    "agent-runtime",
    "agent-postgres",
    "agent-redis",
]

def send_telegram_alert(message: str) -> bool:
    """Send alert message to configured Telegram bot/chat."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("[WATCHDOG WARN] Telegram credentials not configured. Skipping alert.")
        return False

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = json.dumps({
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "Markdown",
        "disable_web_page_preview": True,
    }).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status == 200
    except Exception as exc:
        print(f"[WATCHDOG ERROR] Failed to send Telegram alert: {exc}", file=sys.stderr)
        return False

def check_docker_containers() -> List[str]:
    """Check running containers and verify their health status."""
    issues = []
    try:
        cmd = ["docker", "ps", "--format", "{{.Names}}\t{{.Status}}"]
        output = subprocess.check_output(cmd, text=True, timeout=15)
        running = {}
        for line in output.strip().splitlines():
            if not line:
                continue
            parts = line.split("\t")
            if len(parts) >= 2:
                running[parts[0]] = parts[1]

        for container in REQUIRED_CONTAINERS:
            if container not in running:
                issues.append(f"❌ Container `{container}` is NOT running!")
            elif "unhealthy" in running[container].lower():
                issues.append(f"⚠️ Container `{container}` reports UNHEALTHY status ({running[container]})")

    except subprocess.CalledProcessError as exc:
        issues.append(f"❌ Docker daemon query failed: {exc}")
    except Exception as exc:
        issues.append(f"❌ Docker check exception: {exc}")

    return issues

def check_system_resources() -> List[str]:
    """Check disk and RAM usage thresholds."""
    issues = []
    # Check disk
    total, used, free = shutil.disk_usage("/")
    disk_pct = (used / total) * 100
    if disk_pct > 88:
        issues.append(f"⚠️ Disk usage critical: {disk_pct:.1f}% used ({free // (1024**3)}GB free)")

    # Check RAM via /proc/meminfo
    try:
        with open("/proc/meminfo", "r") as f:
            mem = {}
            for line in f:
                parts = line.split(":")
                if len(parts) == 2:
                    mem[parts[0].strip()] = int(parts[1].strip().split()[0])
            total_kb = mem.get("MemTotal", 1)
            avail_kb = mem.get("MemAvailable", total_kb)
            used_pct = ((total_kb - avail_kb) / total_kb) * 100
            if used_pct > 92:
                issues.append(f"⚠️ Memory pressure critical: {used_pct:.1f}% RAM utilized")
    except Exception:
        pass

    return issues

def check_backup_freshness() -> List[str]:
    """Check if backups exist and are under 24 hours old."""
    issues = []
    stack_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    backup_dir = os.environ.get("BACKUP_DIR", os.path.join(stack_dir, "backups"))
    if not os.path.exists(backup_dir):
        issues.append(f"⚠️ Backup directory missing: `{backup_dir}`")
        return issues
    
    files = [os.path.join(backup_dir, f) for f in os.listdir(backup_dir) if f.startswith("postgres_")]
    if not files:
        issues.append("⚠️ No automated database backups found in `./backups/`")
        return issues
        
    latest_file = max(files, key=os.path.getmtime)
    age_hours = (os.path.getmtime(latest_file) - os.path.getmtime(latest_file)) # placeholder
    import time
    age_hours = (time.time() - os.path.getmtime(latest_file)) / 3600
    if age_hours > 24:
        issues.append(f"⚠️ Latest database backup is {age_hours:.1f} hours old (> 24h threshold)")
    return issues

def check_http_endpoint() -> Optional[str]:
    """Check if the external HTTP endpoint returns HTTP 200."""
    if not HEALTHCHECK_URL:
        return None
    try:
        req = urllib.request.Request(
            HEALTHCHECK_URL,
            headers={"User-Agent": "AgentWatchdog/1.0"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status != 200:
                return f"⚠️ HTTP healthcheck returned HTTP {resp.status} for `{HEALTHCHECK_URL}`"
    except Exception as exc:
        return f"❌ HTTP healthcheck failed for `{HEALTHCHECK_URL}`: {exc}"
    return None

def main():
    print("[WATCHDOG] Executing stack health audit...")
    container_issues = check_docker_containers()
    resource_issues = check_system_resources()
    backup_issues = check_backup_freshness()
    http_issue = check_http_endpoint()

    all_issues = container_issues + resource_issues + backup_issues
    if http_issue:
        all_issues.append(http_issue)

    if all_issues:
        hostname = os.uname().nodename
        msg = f"🚨 *Agent Stack Watchdog Alert* on `{hostname}`\n\n"
        msg += "\n".join(all_issues)
        msg += "\n\n_Auto-recovery check will re-evaluate in 5 minutes._"
        print(f"[WATCHDOG ALERT]\n{msg}")
        send_telegram_alert(msg)
        sys.exit(1)
    else:
        print("[WATCHDOG OK] All services, containers, and resources healthy.")
        sys.exit(0)

if __name__ == "__main__":
    main()
