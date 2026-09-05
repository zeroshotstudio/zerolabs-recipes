# Best Open Source Project Management UI for Agents — ZeroLabs Companion Recipe

> **Canonical Teardown & Architecture Brief:** [Best Open Source Project Management UI for Agents](https://labs.zeroshot.studio/ai-workflows/best-open-source-project-management-ui-agents?utm_source=github&utm_medium=repo&utm_campaign=best-open-source-project-management-ui-agents)  
> **Source Platform:** [ZeroLabs Intelligence Briefs](https://labs.zeroshot.studio)

This directory contains the production-ready code companion, unified task adapter, and agent skill manifest for **"Best Open Source Project Management UI for Agents"**.

---

## Supported Platforms

| Platform | Best For | API Style | Auth Type |
|---|---|---|---|
| **Plane** | Visual Kanban boards & team dashboards | REST v1 | API Bearer Token |
| **OpenProject** | Enterprise workflows, Gantt charts, strict RBAC | REST v3 | API Key / Basic Auth |
| **Vikunja** | Lightweight task-only execution, low resource footprint | REST v1 | API Bearer Token |

---

## Files in this Recipe

- [`starter.py`](./starter.py): `AgentTaskBridge` - unified Python client implementing task lifecycle across Plane, OpenProject, and Vikunja.
- [`SKILL.md`](./SKILL.md): Standing agent skill manifest for Claude Code, Cursor, and OpenClaw agents to manage project tasks autonomously.
- [`.claudecode/skills/project-management-agents.md`](./.claudecode/skills/project-management-agents.md): Claude Code drop-in skill mirror.
- [`test_task_bridge.py`](./test_task_bridge.py): Automated test suite verifying task dispatch, status mapping, and mock simulation mode.
- [`docker-compose.yml`](./docker-compose.yml): Local self-hosted compose file for spin-up testing.
- [`.env.example`](./.env.example): Environment variable template.

---

## Quick Start

### 1. Environment Setup

```bash
cp .env.example .env
```

Set your target provider in `.env` (`PM_PROVIDER=plane`, `openproject`, or `vikunja`) and provide your API token.

### 2. Verify with Offline Simulation Test

The test suite validates adapter payload formatting and state transitions with zero network requirements:

```bash
python3 test_task_bridge.py
```

### 3. Run Agent Task Dispatcher

```bash
# Run in mock/simulation mode
python3 starter.py --mock

# Run against live self-hosted or cloud instance
python3 starter.py --provider plane --action list
python3 starter.py --provider plane --action create --title "Audit security headers" --description "Review CSP policy"
```

### 4. Install Agent Skill for Claude Code / Cursor

Copy the skill definition into your agent workspace:

```bash
# Claude Code
mkdir -p ~/.claude/skills
cp SKILL.md ~/.claude/skills/project-management-agents.md

# OpenClaw / Cursor
cp SKILL.md .agents/skills/project-management-agents/SKILL.md
```

---

## Architecture & Integration Details

Read the complete comparison, permission security models, and production teardown at [ZeroLabs](https://labs.zeroshot.studio/ai-workflows/best-open-source-project-management-ui-agents?utm_source=github&utm_medium=repo&utm_campaign=best-open-source-project-management-ui-agents).

---
*Maintained by [ZeroShot Studio](https://zeroshot.studio) & the ZeroLabs Team.*
