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
1. **Never edit files outside the current feature scope.** Every task must operate within an explicit list of in-scope files.
2. **Never modify package dependencies or configuration files** (`package.json`, `tsconfig.json`, `pyproject.toml`, Dockerfile) without explicit authorization or an approved spec.
3. **Never delete test files or bypass failing checks.** Fix the implementation to satisfy the test contract.

## 3. The 2-Failure Circuit Breaker

If any command, test, or tool call fails twice consecutively with the same error:
1. **STOP immediately.** Do not attempt a third identical retry.
2. Formulate an alternative diagnosis and approach.
3. If no deterministic alternative exists without external input, pause execution and report:
   - What failed.
   - The exact error output.
   - What was attempted.
   - Two distinct options for resolution.

## 4. Execution Workflow

For every non-trivial task:
1. **Read the Spec:** Locate and read the relevant specification file in `specs/`.
2. **Draft the Plan:** Break the task into sequential, atomic subtasks.
3. **Write Tests First:** Create or update unit/integration tests that fail against current code.
4. **Implement Minimally:** Write only the code required to make tests pass.
5. **Verify Deterministically:** Run the project verification command (lint + typecheck + tests).
6. **Commit Atomically:** Create a clean git commit adhering to Conventional Commits.

## 5. Verification Commands

Before marking any task complete, all of the following commands must exit with code 0:
- Linting: `<LINT_COMMAND>` (e.g., `npm run lint` or `ruff check .`)
- Type Checking: `<TYPECHECK_COMMAND>` (e.g., `npm run type-check` or `mypy .`)
- Test Suite: `<TEST_COMMAND>` (e.g., `npm test` or `pytest`)
- Build: `<BUILD_COMMAND>` (e.g., `npm run build`)
