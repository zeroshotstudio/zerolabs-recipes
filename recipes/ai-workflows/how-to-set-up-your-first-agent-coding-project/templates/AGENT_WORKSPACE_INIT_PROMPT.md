# Workspace Initialization Prompt

Copy and paste this prompt into Claude Code, Cursor, or your terminal coding agent when starting a brand-new project repository.

---

```markdown
You are an expert software architect setting up a pristine, agent-native project workspace.

Please execute the following initialization tasks in order:

1. Directory Structure:
   Create the following core directories if they do not exist:
   - `specs/` (for PRDs, specifications, and task ledgers)
   - `docs/` (for architecture diagrams, API contracts, and guides)
   - `scripts/` (for verification, testing, and dev tooling)
   - `prompts/` (for reusable workflows and prompt templates)
   - `src/` (application source code)
   - `tests/` (unit and integration tests)

2. Workspace Contract (AGENTS.md):
   Create `AGENTS.md` at the repository root containing:
   - Our stack definition and package manager
   - Strict directory boundaries
   - A 2-failure circuit breaker (halt and report if a command fails twice with the same error)
   - The required deterministic verification pipeline (lint, typecheck, test, build)

3. Base Documentation:
   - Initialize `specs/README.md` explaining how feature specifications are created and tracked.
   - Initialize `docs/ARCHITECTURE.md` outlining the planned system components.
   - Ensure a robust `.gitignore` is in place for our stack.

Do NOT generate feature code yet. Set up only the workspace skeleton and report the generated file tree once complete.
```
