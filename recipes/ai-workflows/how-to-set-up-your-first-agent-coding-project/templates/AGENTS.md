# AGENTS.md - Project Workspace Contract

This repository is governed by strict agent execution rules. Read this file completely before taking any action or planning code changes.

## 1. Operating Identity and Mandate

- **Role:** Autonomous Software Engineer and Context-Aware Implementation Agent.
- **Workflow Mode:** Spec-First and Test-Driven Development (TDD).
- **Execution Style:** Autonomous within defined boundaries. Plan thoroughly, write tests first, make atomic edits, verify deterministically, then report results.

## 2. Directory Map and Boundaries

```text
├── src/             # Application source code
├── tests/           # Automated test suites (unit, integration, e2e)
├── specs/           # Feature specifications, PRDs, and task ledgers
├── scripts/         # Local verification and automation scripts
├── docs/            # Architecture notes, API contracts, and user guides
└── prompts/         # Structured workflows and task prompts
```

### Boundary Rules:
1. **Never edit files outside the current feature scope.** Every task must operate within an explicit list of in-scope files defined in the approved specification.
2. **Never modify package dependencies or configuration files** (`package.json`, `tsconfig.json`, `pyproject.toml`, Dockerfile) without explicit authorization or an approved spec.
3. **The Immutable Test Rule (Anti-Assertion Erasure):** Never alter, weaken, comment out, or delete existing test assertions to make a test suite pass. You may only add new test cases, or modify tests if and only if the specification itself explicitly altered the expected API output or return schema.
4. **Git Pre-Flight & Branch Isolation:** Always verify `git status --porcelain` is clean before starting any task. Always work in dedicated short-lived feature branches (`feat/<spec-slug>`). Never commit unverified code to the main branch.

## 3. The 2-Failure Circuit Breaker

If any command, test, or tool call fails twice consecutively with the same error:
1. **STOP immediately.** Do not attempt a third identical retry.
2. Formulate an alternative diagnosis and approach.
3. If no deterministic alternative exists without external input, pause execution and report:
   - What failed.
   - The exact error output.
   - What was attempted.
   - Two distinct options for resolution.

## 4. Execution Workflow & Context Compaction Rhythm

Execute tasks using a strict **Spec -> Single Task -> Commit -> Context Reset** cadence:
1. **Verify Git State:** Confirm a clean tree on a feature branch (`git status --porcelain`).
2. **Read the Spec:** Locate and read the active specification in `specs/`.
3. **Draft the Plan:** Break the task into sequential, atomic subtasks sized for single-session execution.
4. **Write Tests First:** Create unit/integration tests that fail against current code (Red phase).
5. **Implement Minimally:** Write only the code required to satisfy the failing test (Green phase) without modifying test assertions.
6. **Verify Deterministically:** Run the project verification command (lint + typecheck + tests).
7. **Commit Atomically:** Commit passing code with a Conventional Commit message referencing the task.
8. **Context Reset / Compaction:** Between tasks, run `/compact` or start a fresh agent session. Re-anchor context from the `specs/` task ledger and `git log -n 5` to prevent context degradation and hallucination.

## 5. Verification Commands

Before marking any task complete, all of the following commands must exit with code 0:
- Linting: `<LINT_COMMAND>` (e.g., `npm run lint` or `ruff check .`)
- Type Checking: `<TYPECHECK_COMMAND>` (e.g., `npm run type-check` or `mypy .`)
- Test Suite: `<TEST_COMMAND>` (e.g., `npm test` or `pytest`)
- Build: `<BUILD_COMMAND>` (e.g., `npm run build`)
