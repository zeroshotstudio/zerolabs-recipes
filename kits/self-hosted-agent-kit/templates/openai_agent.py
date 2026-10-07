#!/usr/bin/env python3
"""
ZeroLabs Self-Hosted Agent Stack // OpenAI & Codex Quick Connect Starter
Connects OpenAI GPT-4o / Codex to self-hosted PostgreSQL 17 task ledger,
Redis queue, and ZeroVPS security guardrails.
"""
import os
import sys
import json
import urllib.request
from typing import Dict, Any

AGENT_HOST = os.environ.get("AGENT_STACK_HOST", "http://127.0.0.1:3080")
AGENT_NAME = "openai-codex-agent"
FRAMEWORK = "OpenAI / Codex"

def dispatch_task(prompt: str, metadata: Dict[str, Any] = None) -> Dict[str, Any]:
    """Dispatch an autonomous task to the self-hosted stack with ZeroVPS guardrails."""
    url = f"{AGENT_HOST}/api/agent/dispatch"
    payload = {
        "agent_name": AGENT_NAME,
        "framework": FRAMEWORK,
        "prompt": prompt,
        "metadata": metadata or {}
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def ping_stack() -> bool:
    """Register agent and test connectivity."""
    url = f"{AGENT_HOST}/api/agent/ping"
    payload = {"name": AGENT_NAME, "framework": FRAMEWORK, "version": "1.0.0"}
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("ok", False)
    except Exception as e:
        print(f"Connection error: {e}")
        return False

# OpenAI Function Calling Tool Definition
OPENAI_TOOL_SPEC = {
    "type": "function",
    "function": {
        "name": "execute_sandboxed_task",
        "description": "Dispatches an autonomous shell or database operation to the ZeroLabs self-hosted stack with ZeroVPS guardrails and PostgreSQL 17 persistence.",
        "parameters": {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "The command or task to execute."
                }
            },
            "required": ["prompt"]
        }
    }
}

if __name__ == "__main__":
    prompt = sys.argv[1] if len(sys.argv) > 1 else "Audit system state and commit task to PostgreSQL 17"
    print(f"⚡ Testing connectivity to {AGENT_HOST}...")
    if ping_stack():
        print(f"✅ Registered agent '{AGENT_NAME}' with self-hosted stack.")
        print(f"▶ Dispatching task: {prompt}")
        result = dispatch_task(prompt)
        print(json.dumps(result, indent=2))
    else:
        print(f"❌ Failed to connect to stack at {AGENT_HOST}")
        sys.exit(1)
