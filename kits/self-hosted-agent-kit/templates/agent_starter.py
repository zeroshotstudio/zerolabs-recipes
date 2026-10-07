#!/usr/bin/env python3
"""
ZeroLabs Self-Hosted Agent Starter (Python)
-------------------------------------------
Connects to your self-hosted agent stack in 1 click.
Pre-wired with PostgreSQL 17 task persistence and Redis 7.4 task queue.
"""

import os
import sys
import json
import time
import urllib.request
import urllib.error

# Connection settings (defaults point to your local/Tailscale agent stack)
AGENT_HOST = os.getenv("AGENT_HOST", "http://127.0.0.1:3080")
AGENT_NAME = os.getenv("AGENT_NAME", "python-worker-01")
FRAMEWORK = "langchain-crewai"

def ping_stack():
    """Send a 1-click heartbeat to register this agent in the stack dashboard."""
    url = f"{AGENT_HOST}/api/agent/ping"
    payload = json.dumps({
        "name": AGENT_NAME,
        "framework": FRAMEWORK,
        "version": "1.0.0",
        "timestamp": int(time.time())
    }).encode("utf-8")
    
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            print(f"[OK] Agent '{AGENT_NAME}' registered with stack: {data.get('message', 'Connected')}")
            return True
    except Exception as e:
        print(f"[ERROR] Could not connect to agent stack at {url}: {e}")
        return False

def dispatch_task(prompt):
    """Dispatch an agent task into PostgreSQL 17 ledger and Redis queue."""
    url = f"{AGENT_HOST}/api/agent/dispatch"
    payload = json.dumps({
        "agent_name": AGENT_NAME,
        "framework": FRAMEWORK,
        "prompt": prompt
    }).encode("utf-8")
    
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            print(f"[SUCCESS] Task '{data.get('task_id')}' committed to PostgreSQL 17!")
            print(f"Status: {data.get('status')} | Guardrails: {data.get('guardrail_status')}")
            return data
    except Exception as e:
        print(f"[ERROR] Task dispatch failed: {e}")
        return None

if __name__ == "__main__":
    print(f"--- ZeroLabs Agent Starter ({AGENT_NAME}) ---")
    if ping_stack():
        prompt = sys.argv[1] if len(sys.argv) > 1 else "Automated data synthesis and verification"
        print(f"Dispatching test task: '{prompt}'")
        dispatch_task(prompt)
    else:
        sys.exit(1)
