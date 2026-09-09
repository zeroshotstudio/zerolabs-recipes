# Spike Spec: [Spike / Micro-Feature Name]

- **Type:** Rapid Spike / Proof-of-Concept / Micro-Feature
- **Timebox:** [e.g., 2 Hours / 1 Day]
- **Target Branch:** `spike/[slug]`
- **Status:** [Draft | Active | Completed | Discarded]

---

## 1. The Single Question to Answer
State the single technical unknown, hypothesis, or user outcome this spike resolves:
> *Example: Can we parse PDF bank statements locally using pdf-parse with >95% table extraction accuracy without calling an external LLM API?*

## 2. In-Scope Files (Maximum 3 to 5 Files)
List only the files created or touched for this exploration:
- `src/experiments/pdf_parser.ts`
- `tests/experiments/pdf_parser.test.ts`
- `scripts/run_spike.ts`

*(Off-limits: core production database, existing auth services, global configuration files).*

## 3. Minimal Acceptance Criteria (Pass/Fail)
Define the concrete exit criteria:
- [ ] 1. Core script processes sample input fixture (`tests/fixtures/sample.pdf`).
- [ ] 2. Expected output structure is returned without unhandled exceptions.
- [ ] 3. Single verification command passes: `<VERIFY_COMMAND>` (e.g., `npx tsx scripts/run_spike.ts`).
- [ ] 4. Test immutability respected: existing test assertions untouched.
- [ ] 5. Findings documented in section 5 below.

## 4. Execution Ledger (3 to 5 Micro-Tasks)
- [ ] Step 1: Create fixture and failing integration test.
- [ ] Step 2: Implement minimal spike logic in experimental file.
- [ ] Step 3: Run verification command and capture throughput/accuracy metrics.
- [ ] Step 4: Commit atomic checkpoint (`spike: evaluate pdf parsing performance`).

## 5. Spike Findings & Next Steps (Filled upon completion)
- **Result:** [Validated / Inconclusive / Failed]
- **Key Discovery:** [Brief summary of findings, limitations, or surprises]
- **Recommendation:** [Graduate to full PRD feature / Discard spike / Pivot approach]
