# 01 - Autonomous MCP Agent Starter

> **Canonical Teardown:** [Autonomous MCP Agent Architecture on ZeroLabs](https://labs.zeroshot.studio/ai-workflows/claude-mcp-agent-starter?utm_source=github&utm_medium=repo&utm_campaign=01-claude-mcp)

A minimal, production-tested harness connecting an Anthropic Claude agent to local Model Context Protocol (MCP) server endpoints with automatic tool calling, loop guards, and token budgeting.

## Features
- Dynamic MCP tool schema discovery
- Guardrail execution loop preventing runaway LLM queries
- Structured SQLite memory state persistence
- Docker Compose 1-click startup

## Quick Start
```bash
cp .env.example .env
# Insert your ANTHROPIC_API_KEY
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python3 app.py
```
