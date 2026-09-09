# Definition of Ready (DoR) Pre-Coding Checklist

Before letting an autonomous agent generate or modify any application code, evaluate your specification against this 6-point quality gate.

If any check fails, do NOT begin coding. Refine the specification first.

---

### [ ] Gate 1: Scope & File Boundaries Locked
- [ ] Every target file to be created or modified is explicitly listed in `specs/PRD.md`.
- [ ] Off-limits files (configs, shared auth libraries, database migrations) are explicitly marked out-of-scope.
- [ ] Non-goals are clearly stated to prevent feature creep.

### [ ] Gate 2: Data Shapes & Interfaces Defined
- [ ] Request and response payload schemas are fully written out (JSON, TypeScript types, or Pydantic models).
- [ ] Database schema changes (if any) are drafted with explicit column types and indexes.
- [ ] Error status codes and error payload structures are specified.

### [ ] Gate 3: Deterministic 1-Command Verification Gate & Test Immutability
- [ ] There is a single command to verify correctness (e.g., `npm run verify` or `pytest tests/`).
- [ ] The agent has the tools and permissions to execute this command locally.
- [ ] The pass/fail criteria are completely objective (exit code 0).
- [ ] Test Immutability Contract is enforced: the agent is strictly prohibited from altering or softening test assertions to make failing checks pass.

### [ ] Gate 4: Sequential Task Ledger Sized for Compaction Loops
- [ ] Tasks are ordered sequentially from tests/types to implementation.
- [ ] Step 1 has zero unanswered questions or dependencies.
- [ ] Each task is atomic (<30 minutes of implementation) to allow clean context compaction (`/compact` or fresh session handoff) between tasks without token bloat.

### [ ] Gate 5: Rollback, Git State & Branch Isolation
- [ ] Clean git working tree verified before launch (`git status --porcelain` is empty).
- [ ] A dedicated short-lived feature branch has been cut (`git checkout -b feat/<spec-slug>`).
- [ ] Destructive commands (e.g., drop tables, rm -rf) are explicitly banned in `AGENTS.md`.

---
**Verdict:**
- If all gates pass: **PROCEED TO IMPLEMENTATION MODE.**
- If any gate fails: **RETURN TO PRD BRAINSTORMING / SPECIFICATION REFINEMENT.**
