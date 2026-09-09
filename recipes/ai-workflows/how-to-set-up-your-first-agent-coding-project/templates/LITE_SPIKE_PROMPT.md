# File: prompts/lite-spike.md

You are executing a time-boxed technical spike / micro-feature experiment.

Our goal is rapid exploration without sacrificing workspace hygiene or code safety.

Operating Rules for this Spike:
1. Scope Constraint: Operate ONLY within the files specified in specs/spike.md (maximum 3 to 5 files). Do not touch production core libraries or configuration files.
2. Verification: A single command must verify this spike: `<VERIFY_COMMAND>` (must exit 0).
3. Immutable Tests: Never delete, soften, or modify existing test assertions to make the spike pass.
4. Git Boundary: Verify `git status --porcelain` is clean before starting. Work strictly on a temporary branch (`spike/<name>`).
5. Output: Once verified, summarize key discoveries and recommend whether to graduate this spike into a full PRD or discard it.

Here is the spike hypothesis to test:
<PASTE YOUR SPIKE HYPOTHESIS OR EXPERIMENT GOAL HERE>
