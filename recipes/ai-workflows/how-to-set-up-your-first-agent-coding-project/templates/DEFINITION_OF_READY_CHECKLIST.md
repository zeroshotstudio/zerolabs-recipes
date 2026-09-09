# Definition of Ready (DoR) Pre-Coding Checklist

Before letting an autonomous agent generate or modify any application code, evaluate your specification against this 5-point gate.

If any check fails, do NOT begin coding. Refine the specification first.

---

### [ ] Gate 1: Scope & File Boundaries Locked
- [ ] Every target file to be created or modified is explicitly listed.
- [ ] Off-limits files (configs, shared auth libraries, database migrations) are explicitly marked out-of-scope.
- [ ] Non-goals are clearly stated to prevent feature creep.

### [ ] Gate 2: Data Shapes & Interfaces Defined
- [ ] Request and response payload schemas are fully written out (JSON, TypeScript types, or Pydantic models).
- [ ] Database schema changes (if any) are drafted with explicit column types and indexes.
- [ ] Error status codes and error payload structures are specified.

### [ ] Gate 3: Deterministic 1-Command Verification Gate
- [ ] There is a single command to verify correctness (e.g., `npm run verify` or `pytest tests/`).
- [ ] The agent has the tools and permissions to execute this command locally.
- [ ] The pass/fail criteria are completely objective (exit code 0).

### [ ] Gate 4: Sequential Task Ledger (Zero Ambiguity on Step 1)
- [ ] Tasks are ordered sequentially from tests/types to implementation.
- [ ] Step 1 has zero unanswered questions or dependencies.
- [ ] Each task is atomic enough to verify independently.

### [ ] Gate 5: Rollback & Safety Boundaries
- [ ] Clean git working tree verified before launch (`git status --porcelain` is empty).
- [ ] A new feature branch has been cut (`git checkout -b feat/spec-name`).
- [ ] Destructive commands (e.g., drop tables, rm -rf) are banned in `AGENTS.md`.

---
**Verdict:**
If all 5 gates pass: **PROCEED TO IMPLEMENTATION MODE.**
If any gate fails: **RETURN TO PRD BRAINSTORMING / SPECIFICATION REFINEMENT.**
