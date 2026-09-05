---
name: project-management-agents
description: Autonomous project management skill for AI coding agents. Enables agents to create, inspect, and update Kanban task cards and status across Plane, OpenProject, and Vikunja.
version: 1.0.0
---

# Project Management for Coding Agents: Plane, OpenProject & Vikunja

Use this skill when you need an autonomous agent to record milestones, create issue cards, log blockers, or advance Kanban boards during multi-step development.

## Behavioral Guardrails

1. **Principle of Least Privilege:** Never request admin API tokens for automated workflows. Agents only need scoped `read:issues` and `write:issues` permissions.
2. **Deterministic Status Mapping:** Standardize statuses across tools:
   - `backlog`: Staged but not actively being coded.
   - `in_progress`: Actively checked out or being implemented.
   - `review`: Code generated and verified, awaiting review.
   - `done`: Merged and verified in target environment.
3. **Traceability:** Always append the agent name, session identifier, and commit hash in task descriptions.
4. **No Destructive Deletions:** Never delete project workspaces or issues. If an issue is obsolete, mark it as `canceled` or add a resolution comment.

## Quick Invocations

### 1. Python Adapter CLI
```bash
# List open issues
python3 starter.py --provider plane --action list

# Create a tracked task
python3 starter.py --provider plane --action create \
  --title "Implement OAuth Token Refresh" \
  --description "Ensure expired JWT tokens trigger silent renewal." \
  --status "in_progress"

# Update status on completion
python3 starter.py --provider plane --action update \
  --task-id "TSK-101" \
  --status "done"
```

### 2. Direct REST Fallback (Plane)
```bash
curl -X POST "$PLANE_BASE_URL/api/v1/workspaces/$PLANE_WORKSPACE_SLUG/projects/$PLANE_PROJECT_ID/issues/" \
  -H "Authorization: Bearer $PLANE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Implement Rate Limiter",
    "description_html": "<p>Add token bucket algorithm</p>",
    "status": "backlog"
  }'
```

### 3. Direct REST Fallback (Vikunja)
```bash
curl -X PUT "$VIKUNJA_BASE_URL/api/v1/projects/$VIKUNJA_PROJECT_ID/tasks" \
  -H "Authorization: Bearer $VIKUNJA_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Configure Healthcheck Route",
    "done": false
  }'
```
