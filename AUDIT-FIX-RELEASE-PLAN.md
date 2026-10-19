# Agent Kit and repository fix and release plan

Audit baseline: `85c24b7301a64fbe1714a4bf9483e83e334b4968` on `codex/agent-kit-overhaul`, [PR #1](https://github.com/zeroshotstudio/zerolabs-recipes/pull/1). Reviewed 2026-10-11 UTC. This register retains every original finding and recommendation and adds issues discovered during remediation. Public release remains on hold until the evidence below is complete.

All ten original findings have fixes and regression evidence; additional kit/recipe findings have corrections or documented image-advisory dispositions. Independent review found no remaining blocking code defect within that audited scope. The follow-up 86-file customer ZIP passes strict verification, provider-receipt regressions and complete CI at product source `a11ea1d`. The separately deployed site's source fixes and commerce flows are now implemented in [ZeroLabs PR #24](https://github.com/zeroshotstudio/ZeroLabs/pull/24); its live deployment/privacy gate remains open under N13. Site dependency findings are retained under N14–N15. See [the revalidation report](reports/agent-kit-audit-revalidation.md) for evidence and remaining limits. Account/deployment gates still determine public-launch readiness.

## 1. Original findings: required fixes and closure evidence

| ID / priority | Identified issue | Required implementation | Evidence needed to close |
| --- | --- | --- | --- |
| 1 / P1 | Root installation preserves the download owner's ownership; the root backup timer can execute user-writable code. | Root-own all trusted installation files and directories on fresh, same-directory and update paths. Detach previously writable file inodes. Refuse unsafe ancestors and symlinks. Preserve credentials, runtime contents and active backup locks. Define deliberate unprivileged installation separately. | Run the actual installer as root, then prove UID 1000 cannot change or replace trusted files, `.env`, Compose configuration or helper code. Cover reinstallation, updates, hardlinks, ancestors, symlinks, active locks and unprivileged installs. Independently review the root timer's execution path. |
| 2 / P1 | A stale heartbeat error aborts a newly claimed healthy task after database recovery. | Bind heartbeat renewal and errors to the execution captured at entry. Abort only that same execution. Verify a fresh lease before starting a newly claimed task. | Deterministic actual-worker tests for idle and previous-task heartbeat failures after a new claim; genuine current-task failure still aborts. Run database-outage and two-worker resilience checks. |
| 3 / P2 | SIGTERM during `claim()` can start new, potentially billable provider work. | Recheck shutdown after claim and lease awaits. Return only never-executed claims safely to the queue, preserve cancellation, and require manual review for already executed work. | Deterministic SIGTERM-during-claim and renewal tests; no new runner call, no automatic replay of executed work. Verify interruption recovery in Docker. |
| 4 / P2 | Task polling or an in-flight detail response replaces retry confirmation and the command palette. | Explicit dialog mode/version and request sequencing; render only into the same current detail dialog. Clear task selection for other dialogs. Preserve keyboard focus. | Browser tests through multiple poll cycles and delayed responses, including same-task close/reopen, retry and palette focus. |
| 5 / P2 | The skip link's `#main` fragment routes the user back to Overview. | Focus main content without changing the route. | Keyboard activation from all six sections preserves the hash and heading and moves focus to main. |
| 6 / P3 | Concurrent token issuance exceeds the 50-token limit; token audit insertion is separate. | Serialize count, insertion and audit under one database transaction and advisory lock. | Actual PostgreSQL test from 49 tokens with eight simultaneous issuances: exactly one success, seven limit failures, total 50. Forced audit failure rolls back token creation. |
| 7 / P1 | Recipe 19 runs model-selected Bash on the host while claiming a sandbox; output capture is unbounded, and the cURL probe uses unsafe evaluation. | Require Docker isolation in Python and TypeScript with no host fallback. Nonroot user, no network, read-only root and inputs, fresh bounded writable workspace, resource limits, dropped capabilities, bounded incremental output and container-wide time limits/cleanup. Remove shell evaluation from the probe. State trusted-runner/kernel and per-call workspace limits. | Actual Docker tests for host/symlink escape, network, writes, memory/PIDs, output limits including Unicode, timeout descendants and cleanup; adversarial probe response stays data. Test Docker-unavailable and delayed-create failure paths. Compile both implementations and review copied blog examples. |
| 8 / P1 | Recipe 20 accepts sibling-prefix paths and symlinks outside its workspace. | Canonical ancestry validation plus held root directory/per-component no-follow operations. Reject symlinks, hardlinks and special files. Use a private, single-writer workspace and fail closed on unsupported platforms. Correct documentation of concurrency guarantees. | Python and TypeScript tests for sibling-prefix, symlink reads/writes/parent paths, root replacement, hardlinks, special files, exclusive creation/ownership and valid editing. Verify literal replacement, bounded undo history and failed-edit history behavior. |
| 9 / P2 | Secret scanner misses modern OpenAI/Anthropic formats and exempts entire lines containing `example.com`. | Match current formats and apply placeholder exemptions only to complete matched values. Redact matches and output paths. Fail closed on read/traversal/git errors and unsupported text encoding. Scan the exact intended files rather than excluding unrelated files by basename. | Synthetic regression cases for modern keys, neighboring placeholders, output secrecy, nested scanner-named files, unreadable paths, filename credentials, UTF-16 and staged/binary-file handling. Run the scanner on final source and staged changes. |
| 10 / P2 maintenance | Recipes 23 and 25 lock MCP SDK 1.30.0 with high advisory GHSA-6qxp-vccf-f47h. | Upgrade compatible dependency ranges and locks to a fixed SDK (at least 1.31.0); retain pinned installs and add repository dependency auditing. | Clean `npm ci`, TypeScript builds and zero-advisory audits of both packages; real offline stdio MCP smoke. Agent Kit's separate SDK lock must remain clean. |

Findings 7, 8 and 10 concern repository recipes outside the Agent Kit ZIP. They still require closure before advertising the whole repository as safe reference code. Finding 6 remains in the register despite its lower priority.

## 2. Issues discovered during remediation

| ID | Issue and fix | Closure evidence |
| --- | --- | --- |
| N1 | Retained user-owned sourceless Python bytecode can shadow standard libraries when a root helper runs. Invoke privileged helpers with `python3 -I`, normalize retained caches, and exclude source caches from copying. | Real `backup.sh` path with synthetic local bytecode and hostile `PYTHONPATH`; marker must never execute as root. Independent installer review and all six installer regression groups. |
| N2 | Recipe 19 timeout during Docker creation can race an absence check. Separate acknowledged `docker create` from `start`; never start model code after an unacknowledged create, and report container metadata when daemon cleanup cannot be established. | Deterministic delayed-daemon-create regression and fresh real-container tests in both languages. |
| N3 | Secret-bearing filenames can leak through scanner output; UTF-16 text can bypass matching. Redact paths and use BOM-aware decoding or fail closed. | Redacted CLI output and UTF-16/staged binary regression cases, independently reviewed. |
| N4 | Broader TypeScript coverage exposed build errors in Recipes 14 and 16 and missing build configuration for 21. Correct schema typing, SDK stop-reason typing and strict build configuration. | Every tracked TypeScript recipe passes a locked install, compilation and its available offline tests. |
| N5 | Recipe 21 describes simulated desktop actions as real execution and implies unimplemented isolation/approval controls; its Python dispatch and screenshot also have defects. Clearly label it a protocol simulator throughout code, metadata, README, blog and historical report. Remove fake safety flags and unsupported benchmarks; fix duplicate action dispatch, endpoint and PNG. | Python mock tool-loop and TypeScript offline smoke; source review confirms outputs disclose `simulated: true` and no real desktop/security claim. Review any separately published article before promoting those claims. |
| N6 | Existing release ZIP is stale after source fixes; package verification has a hardcoded version and incomplete metadata assertions. Regenerate the release and share strict bundle validation between update/package tests. | Version, exact membership, regular-file modes, byte sizes, hashes, digest equality, external checksums and credential exclusions all match; execute the extracted ZIP. |
| N7 | Container OS and bundled tooling were not covered by npm audits. A fresh Grype scan identifies additional image advisories. Triage every match, update compatible pinned images and remove unnecessary runtime package managers; preserve evidence for any residual upstream issue. | Scan the actual final app image and pinned PostgreSQL/Caddy images with a current vulnerability database. No unexplained blocking advisory; record limitations and any justified vendor-based disposition. Re-run affected runtime checks after image changes. |
| N8 | A delayed document response replaces a newer palette/task dialog; a completed deletion or token mutation can replace a newly selected section. Guard all asynchronous dialog/route mutations using their original context and preserve newer navigation. | Actual-browser delayed-read and delayed-mutation regressions; newer dialog, route content and focus remain intact and background errors do not access removed form nodes. |
| N9 | A staged filename beginning `0:` is interpreted as a Git revision and can make the scanner read a different clean blob. Read index entries with an explicit stage or resolved object ID. | Stage both a clean file and a synthetic credential-bearing `0:` filename; scanner must inspect the intended blob, return failure and redact output. |
| N10 | Live article review exposed remaining unsupported Recipe 20 timing/token claims in the repository article. Replace the quantitative claims and benchmark framing with accurate qualitative descriptions. | Review the final article and CMS payload: no unsupported numerical performance guarantee remains; copied code links resolve to the audited branch. |
| N11 | The live-provider smoke script could print a passing receipt despite missing per-response usage or inconsistent task totals. Require measured, safe-integer usage on every model response and reconcile the task totals before passing. | Execute the actual script's JavaScript offline against valid, missing, invalid, mismatched and overflowing usage responses. CI runs this regression; the actual account/model smoke remains a separate gate. |
| N12 | The kit license's unqualified warranty disclaimer can mislead purchasers about mandatory consumer rights. Preserve non-excludable guarantees, remedies and digital-content updates, including Australian and applicable overseas protections. | Review against current official Australian/EU/German sources and independent clause checks. Preserve existing permission grants, prior public grants and third-party notices. Complete the actual storefront's legal presentation and withdrawal/refund flow separately. |
| N13 / open live-site gate | The separately deployed ZeroLabs legal pages retain Berlin/contact details that conflict with the confirmed Australian operator, and GA4 initializes without a source-level consent condition. Existing analytics/privacy statements do not accurately establish the observed PostgreSQL/contact/newsletter/optional Turnstile flows. | Prepare exact application-source corrections and a fact-dependent privacy inventory; use the actual deployment route. Verify the final identity, vendor roles, retention/transfers and regional tracking/consent behavior in a real browser. These external application defects are not closed by recipe payloads, draft terms or kit CI. |
| N14 / fixed site source | The separate site's production npm audit reported 3 Critical, 50 High, 88 Moderate and 16 Low advisory records, including outdated Next.js/MCP dependencies and a development CLI installed as production. | ZeroLabs PR #24 updates compatible packages and transitive pins, moves shadcn to development, and passes the production build, existing content/MCP tests and a zero-advisory production npm audit. Require site CI and actual deployment; this does not change the kit archive or certify the site OS image. |
| N15 / open development maintenance | The complete site development graph retains High `GHSA-vfj7-8cjw-p6xm` in braces 3.0.3 through ESLint/fast-glob/shadcn. No patched registry version is published. | Restricted to trusted repository build/lint patterns; absent from the production dependency audit and inspected standalone output. Do not expose those tools to untrusted patterns. Track/adopt the published upstream fix. No audit ignore or assertion of a clean full development graph. |
| N16 / fixed site source | The first merged-site main build failed in Next.js's Google-font loader, although prior PR builds passed. | Bundle pinned IBM Plex Sans/JetBrains Mono fonts through next/font/local, preserving families/weight ranges and carrying their OFL notices. The loader/network dependency is removed; the full production build and existing content checks pass. Main CI repeats browser/rendering checks. |
| N17 / fixed site source | Removing secrets from the Docker context exposed a build dependency on production DATABASE_URL for three curriculum hubs; listing fallbacks could also bake empty live-data pages. | Render live-data hubs, homepage/pagination and course index at runtime. The complete build now passes without DATABASE_URL; CI repeats both credential-free and fixture-database builds. Runtime DB credentials remain outside image build layers. |


## 3. Automation and final-source validation

Engineering owns this phase. It follows implementation and independent review of the original and additional findings.

1. Expand Recipes CI to discover all tracked TypeScript packages; commit locks; use `npm ci`, dependency audits, compilation and available offline tests. Add Python offline suites and audit every declared recipe requirements file. Keep tests independent of paid provider accounts.
2. Add marketing path triggers and browser checks to Agent Kit CI. Audit the three actual kit runtime images with a checksum-verified scanner and fail CI for High/Critical matches; retain scan JSON and explain residual inventory limits. Validate MP4 metadata/hashes and download delivery, playback, five chapters, eleven caption cues, replay, keyboard/touch interaction, tabs/menu/FAQ, valid and invalid checkout configuration, no-JavaScript/blocked-media/no-range fallbacks, accessibility and overflow at 1440/900/390/320 px. Save screenshots and results as CI evidence.
3. Add deterministic regressions for worker lifecycle, real PostgreSQL token concurrency, installer trust, dashboard routing/dialogs, shell isolation, file containment and scanner behavior. A routine passing test does not close an untested race.
4. On the final source, run shell/Python syntax, generated-document comparison, systemd unit validation, recipe Compose validation, Python lint, secret scan and runtime/MCP/test dependency audits.
5. Run Agent Kit's 16 API/worker acceptance groups, actual MCP stdio client, browser workflows with all 16 accessibility/overflow views, authentication/rate/header-spoof checks, and six failure-recovery/privilege groups.
6. Run eight operations groups: real `pg_dump`, verified rclone local-remote round trip, outage preservation and temporary cleanup, corrupt/traversing archive rejection, retention validation, installer behavior, isolated restore with matching data and token revocation, and occupied-target refusal.
7. Rehearse a real v2 update with a verified pre-update backup. Prove configuration, documents, task results and tokens survive. Rehearse rollback into a separate clean project with the matching old app and pre-update backup; verify data and readiness and revoke old tokens. This same-schema rehearsal does not certify arbitrary future migrations.
8. Rebuild generated guides, source digest, release manifest, versioned ZIP and checksums together. Execute customer acceptance from that exact extracted archive, including clean initial state, API/MCP/browser/rate checks and the default installer without a model key or fixture override.
9. Obtain complete green Recipes CI and Agent Kit acceptance runs on the final release commit. The failed baseline run [38133556978](https://github.com/zeroshotstudio/zerolabs-recipes/actions/runs/38133556978) and earlier successes on other commits do not satisfy this gate. Preserve run URLs, artifact checksum and fresh audit evidence with the release record.
10. Conduct an independent audit of the final changes; address new blockers before claiming the code audit is clear. Do not infer public-release readiness solely from local fixture tests.

## 4. Account and deployment gates

The product owner and deployment operator own this phase. Run it against the release commit and artifact validated above. No account configuration was supplied during the baseline audit.

| Gate | Required work | Evidence / exit criterion |
| --- | --- | --- |
| Live provider | Configure the intended OpenAI account and exact model securely; recreate the worker and run `scripts/provider-smoke.sh`. | An actual calculation tool call and saved artifact contain the expected answer; usage is measured and logs disclose no key. Record account/model/date and outcome without exposing credentials. Fixture answers are insufficient. |
| Target host | Fresh installation and restore rehearsal on the chosen supported Ubuntu/Debian host. Inspect permissions and ancestor trust, services, disk alerts and resource limits. | Real host startup/readiness; matching restored result/document; actual systemd backup timer firing; monitored disk condition; external monitor observes `/health/ready`. Unit syntax and Docker-only tests are insufficient. |
| HTTPS / access | Validate the chosen real domain/ACME setup or actual Tailscale account and HTTPS access. | Valid certificate, intended access policy and external routing; API/DB remain internal and operator access works from the intended client. Static Caddy validation does not establish account access. |
| Encrypted offsite backup | Configure intended rclone cloud remote and encryption. Store secrets and encryption keys separately in the password vault. Download and restore from that remote. | Matching archive hash, successful clean restore and demonstrated key recovery. Local filesystem rclone tests do not satisfy this gate. |
| Commerce | Set approved checkout URL, price/currency/billing basis, tax handling, purchaser entitlement and ZIP delivery. Perform a real end-to-end purchase and permitted refund flow. | Correct charge, entitlement, matching artifact download, published support contact/refund terms and successful delivery. Keep sales disabled until configured; do not invent pricing. |
| Licensing | Settle commercial distribution expectations and earlier public license grants; align repository notice, kit license, sales copy and purchaser terms. | Owner-approved terms and scope. Earlier published rights are not revoked by a later license notice. Code review cannot settle the owner's distribution decision. |
| External claims | Check any separately hosted Recipe 19/20/21 articles or sales pages for old sandbox, editor or desktop guarantees. | Published claims match final implementation. Repository corrections do not automatically update an external CMS. |

### Owner configuration received after the initial audit

The owner selected an Australian seller selling worldwide, including the EU,
and supplied legal identity/contact information for the terms. Official ABN
Lookup lists ABN 30 285 930 662 as an active individual/sole trader under James
John Goode, not currently registered for GST. See
[the official record](https://abr.business.gov.au/ABN/View?id=30285930662).
The owner subsequently selected Lemon Squeezy. This does not establish the actual
store contract, tax treatment, product price or contracting identity for that account.

Prepare Australian base terms with EU consumer information; preserve mandatory
local protections for targeted overseas consumers. The actual checkout must
provide durable contract information, transparent total pricing and the required
online withdrawal and acknowledgment function. A terms document or email link
alone cannot satisfy [current § 356a BGB](https://www.gesetze-im-internet.de/bgb/__356a.html).
Price, storefront account/product, authenticated ZeroVPS access, provider/model
and encrypted backup/monitoring configuration remain necessary inputs.

Public HTTP checks confirmed all three live Recipe 19/20/21 articles contain
outdated claims. The live ZeroLabs site stores posts in PostgreSQL and exposes
an authenticated article-update API; updating dead MDX source files does not
correct published articles. Prepare complete body and structured-metadata
payloads, preserve snapshots, and verify authenticated readback plus rendered
pages after applying them through the owner's connected access.

Reviewed prelaunch sales, withdrawal and privacy preparation is versioned in
[marketing/agent-kit/legal](marketing/agent-kit/legal/README.md). Three separate
drafting/source checks do not certify worldwide enforceability or the selected
checkout account. Its actual seller/MoR, price, genuine contact, tax, durable confirmation,
withdrawal/refund and privacy acceptance cases remain open. The live site's
privacy/terms application pages and nonessential tracking require separate
application deployment and browser verification; retain N13 until that succeeds.

### Product/site implementation follow-up — 2026-10-13

[ZeroLabs PR #24](https://github.com/zeroshotstudio/ZeroLabs/pull/24) now implements
Lemon Squeezy checkout, immutable terms snapshots, canonical signed order events,
private checksum-verified buyer delivery, purchaser-only redelivery, two-step
withdrawal with durable dated receipts and email retries, and explicitly assigned
operator full refunds with no automatic financial replay. It also records email/postal
declarations and defect/non-delivery cases. The imprint, request links, tracking fixes,
Docker/standalone secret exclusions and prepared article-update tooling are integrated.
The CMS updater refuses concurrent edits and preserves timestamp microseconds.

All 35 PostgreSQL commerce tests passed, plus actual local HTTP/CMS checks, browser
accessibility/overflow at three widths, the production build, 21 existing content suites
and eight public MCP security/protocol groups. The site maintains a separate CI workflow.
The full evidence and configuration checklist are in that PR's
`docs/AGENT-KIT-COMMERCE-VALIDATION.md` and `docs/AGENT-KIT-COMMERCE.md`.

Sales remain disabled without actual store/variant/API/webhook bindings, approved
price/currency and merchant/legal facts, a verified email sender, private release files,
assigned operators and finalized terms. No real transaction/email, ZeroVPS deployment,
timer firing or live article write occurred. These remaining activation checks keep N13
and the applicable account/deployment gates open. The kit source and ZIP are unchanged.

### Launch implementation selected and promoted to main — 2026-10-13

The owner selected this Agent Kit and site implementation as the launch product
and authorized promoting the working branches to main. Product PR #1 merged as
`22efe3f`; site PR #24 merged as `4ba6291`, with build corrections in site commit
`bbc2441`. Both local checkouts track main. Two unrelated recipe additions already
on main were preserved; the reviewed Agent Kit, marketing and archive bytes match
`2009143` exactly. The 2.0.0 customer ZIP remains SHA-256
`6a2f13f9385a4ebfc5d1dedef07b5975d0ff8aaabe67c7bfe7efbd48f7d79b39`.

Product main at `22efe3f` passed [Recipes CI 38418662507](https://github.com/zeroshotstudio/zerolabs-recipes/actions/runs/38418662507)
and [complete Agent Kit acceptance 38418662486](https://github.com/zeroshotstudio/zerolabs-recipes/actions/runs/38418662486).
N16–N17 record the site build follow-up. Source selection and main adoption do not
satisfy the remaining account, legal, host, timer, backup and real transaction gates.

A read-only public check found `/api/health` healthy and `/agent-kit`, its order page
and withdrawal page still returning 404. ZeroVPS repository access works, but there
is no deployment Actions workflow and no host/VPN/MCP connection bound here. Its
normal deployment/updater contract requires actual host backup, migration, immutable
rollback and health/state verification. No host mutation, live article write,
commerce activation or financial transaction was performed in this follow-up.

## 5. Release sequence and rollback

1. Close code findings and independent re-audit; freeze the intended source. Complete final-commit CI and artifact checks.
2. Complete live-provider, target-host, real networking, encrypted offsite and commercial/licensing gates. Record evidence and accountable owner for each; unresolved items remain explicit release blockers.
3. Install v2 separately from the existing v1 service. Never perform an in-place v1 upgrade. Legacy task rows remain archived/unverified. Preserve the current service until the replacement has passed validation.
4. Save the matching application release, verified database backup and vault-held configuration secrets before cutover. Confirm restore and rollback procedure, monitor readiness and failures, and avoid automatic replay of interrupted provider tasks.
5. After release authorization, publish the verified ZIP/checksums and matching documentation, enable the approved sales flow, and deploy the validated replacement. Review support and refund readiness before public access.
6. During initial operation, monitor readiness, queue failures, worker leases, provider usage, disk capacity, backup verification/offsite success and actual scheduled runs. If acceptance fails, disable the sales/cutover path and restore the matching old application plus pre-update backup into a clean project; do not run older code against an incompatible migrated database.

## Completion rules

Every original finding remains individually traceable; additional findings and recommendations remain in this register. An item closes only with its stated implementation and evidence. A code-audit result and a public-launch decision are recorded separately. Automated axe checks do not certify every accessibility need or Safari device; dependency/image scans are time-specific; protocol fixtures are not live models; same-schema rollback is not proof of every future migration. No merge, existing-host replacement, payment configuration or public publication is implied by remediation work.


## Deployment/release revalidation — 2026-10-18

Public launch remains **BLOCKED**. The selected implementation remains on main;
current product main `b6640b379d0d42df9cf5b4a8df11788487360e1b` has passing
[Recipes CI 38989450185](https://github.com/zeroshotstudio/zerolabs-recipes/actions/runs/38989450185).
The kit/marketing files have no changes from the reviewed release. The approved
ZIP recovered from [acceptance 38418662486](https://github.com/zeroshotstudio/zerolabs-recipes/actions/runs/38418662486)
passes strict manifest/membership/mode/size/hash/digest validation and remains
SHA-256 `6a2f13f9385a4ebfc5d1dedef07b5975d0ff8aaabe67c7bfe7efbd48f7d79b39`.
No replacement archive or new public release was published.

| Register IDs | Current disposition |
| --- | --- |
| 1, N1 | Installer ownership/root-helper fixes retained; complete release CI evidence retained. Intended real host ownership/timer acceptance remains open. |
| 2, 3 | Worker lifecycle fixes retained; fresh unit regressions pass. No real provider execution or automatic retry performed. |
| 4, 5, N8 | Browser/navigation fixes retained; linked release acceptance remains applicable to unchanged kit files. |
| 6 | Fresh actual PostgreSQL token concurrency/audit rollback regression passes. |
| 7, N2 | Docker-only shell fixes retained; current Recipes CI passes. This does not correct hosted article bodies. |
| 8 | File-editor boundary fixes retained; current Recipes CI passes. |
| 9, N3, N9 | Scanner protections retained; current Recipes CI passes. |
| 10 | Patched MCP locks retained; current Recipes CI passes. Fresh kit MCP audit also remains zero-advisory. |
| N4, N5, N10 | Recipe build/simulator/claim corrections retained; current Recipes CI passes. All three hosted articles still require authenticated canonical corrections. |
| N6 | Exact approved archive, external checksums and complete manifest validation pass; current packaged files match byte for byte. |
| N7 | Exact ZIP images rebuilt and rescanned separately; dated image evidence/dispositions are recorded in the operations release evidence. Provider/target-host acceptance remains separate. |
| N11 | All 24 actual-script provider-receipt regressions pass; actual account/model tool call, artifact 437 and measured-usage acceptance remain open. |
| N12 | Packaged mandatory-rights license remains byte-identical. Actual merchant/licensor/terms/privacy approval and transaction acceptance remain open. |
| N13 | OPEN: live legal/privacy/tracking and article corrections are not deployed. Production still lacks the Agent Kit routes. Recovery evidence blocks rollout. |
| N14 | Selected-site production dependency audit remains zero-advisory; production still serves an older image. Actual candidate/serving image evidence is tracked privately in operations. |
| N15 | OPEN MAINTENANCE: registry latest braces remains 3.0.3 and upstream advisory lists no published patch. Full development audit retains one High; production audit and inspected standalone output exclude it. Trusted repository patterns only; no ignore or clean-full-graph claim. |
| N16 | Bundled font correction retained; credential-free production build passes. |
| N17 | Runtime live-content correction retained; credential-free build passes. Four additional discovery routes were corrected on site PR #25 so request analytics do not execute while building. |

Additional operations findings remain explicit:

- N18: ZeroLabs backup inventory omitted private content/legal/release state and
  its local uploads volume. Committed source correction and a restore/fail-closed regression
  are installed through ZeroVPS PR #45. A fresh local archive restores 354 posts,
  19 public tables and 47 hashed data files in isolation; verified-offsite capture,
  remote restore and key recovery remain required.
- N19: Production release metadata is inconsistent and the reverse proxy currently
  appends a caller-controlled forwarded IP chain. Establish the deployed immutable
  image/source evidence and overwrite trusted client-IP headers before commerce
  acceptance. Do not infer these facts from selected Git main.

Fresh commerce validation passed all 35 isolated PostgreSQL tests with the actual
approved ZIP, HTTP and CMS-precondition checks, and Chromium desktop/mobile
accessibility/receipt/download checks. These use payment/email fixtures. There
are no actual purchase/delivery/email/refund, real provider, target-host timer,
external monitor, encrypted offsite restore or key-recovery receipts.

Outstanding owner inputs remain the approved store/variant/price/currency and
actual merchant/tax arrangements; finalized legal/privacy/support commitments;
secure payment/email credentials and authorized operator IDs; intended separate
v2 host/model/access/monitoring configuration; encrypted remote and vault-held
recovery keys; and an approved live payment method/amount. Deployment is blocked
by verified-offsite backup failures. Sales and legal approval flags remain closed.

Full private operational evidence is maintained in ZeroVPS
`docs/releases/2026-10-18-agent-kit-release.md`. Earlier public license grants
remain valid. Repository visibility/source-control policy needs explicit
reconciliation before installing a custom production service.


Site PR #25 also fixes the final image security boundary: its bare pinned Node
runner installs exact reviewed shared-library revisions and excludes build
package managers. A fresh actual image has zero detected High/Critical matches,
three Medium BusyBox matches and the documented embedded-OpenSSL inventory limit.
The CI actual-image scan addition is prepared but publishing it requires GitHub workflow scope; the exact patch is retained in operations evidence. Isolated image routes pass without
production bindings; production deployment remains blocked. CodeRabbit raised
0 issues on the backup, discovery and image/CI corrections.

## Owner follow-up and release scope — 2026-10-19

The owner marked the commercial offer TBA, requested support-agent and acceptance
setup planning, and confirmed the intended broad provider/client scope. Paid sales
remain closed. All register dispositions above remain traceable; the following
updates supersede the dated workflow-access/private-source blockers only.

- **Workflow publication access resolved:** the existing organization SSH identity
  pushed site commit `04f8539`. Candidate runtime-image audit enforcement is now in
  site PR #25; it scans the built candidate, not the production container.
  [CI 39214956130](https://github.com/zeroshotstudio/ZeroLabs/actions/runs/39214956130)
  passed all source/security verification steps, then failed the required report
  upload because the GitHub account's Actions artifact quota is exhausted.
- **Private application source established:** private `zeroshotstudio/ZeroKit`
  preserves the kit subtree/history imported from public main `ec788018606ef974d1984b59d805f24b35393dc1`.
  Import commit `b2425784105f0ddf55685b45c79f5fb3d6cd395a`, tag
  `agent-kit-2.0.0-source-import`. All 84 manifest-listed files match, and the exact
  approved ZIP/checksums/digest are retained as a private draft release. An
  authenticated download verified the unchanged approved SHA-256. Public recipe
  links/visibility and valid earlier grants remain unchanged. No v2 deployment
  is implied. Port the complete package acceptance CI to ZeroKit before a new
  product release; the subtree import does not include its parent workflow.
- **N18 current gate:** ZeroLabs now has verified offsite evidence, while PostgreSQL
  and MinIO remain blocked. Encrypted remote download/restore and key recovery
  remain unproven. The original local restore is not substituted for those gates.
- **N20 — unfinished provider scope:** the original quick-connect scope was wider
  than its simulated execution implementation. The v2 rebuild introduced real
  OpenAI execution but did not complete that breadth. Plan native OpenAI,
  Anthropic and Google adapters plus individually accepted agent-client connections
  and guided account setup. Subscription entitlement/authentication is a separate
  supported integration question. No extra provider is shipped by this plan.
  Implement and accept the intended scope in a newly versioned package; retain
  2.0.0 bytes and purchaser access.
- **N21 — release evidence storage:** resolve the GitHub account artifact quota and
  rerun latest-head site CI with the candidate scan JSON retained. Do not weaken
  the severity or evidence gates or delete purchased-release evidence to obtain
  a passing run. Workflow publication permission is no longer the blocker.

Support preparation pins nine release documents by hash, with cited retrieval,
human-reviewed drafts, deterministic declaration intake and no model financial,
administrative or shell authority. No support inbox or sending runtime is active.
A protected commerce profile/runbook keeps sales closed and test mode selected;
actual store/legal/sender/operator bindings and approved live payment amount/method
remain required. A separate disclosed synthetic/read-only customer preview is
planned; the current shared operator workspace is not a public multi-user trial.

Fresh production checks still find a healthy site and four Agent Kit routes at
404. Deployment provenance, trusted forwarded-IP handling, migration, real
mail/timer/monitoring, provider/host acceptance, canonical article corrections and
actual purchase/withdrawal/refund evidence remain open. Detailed plans, redacted
evidence and remaining inputs are maintained in private ZeroVPS
`docs/releases/2026-10-19-agent-kit-followup.md`. No customer-facing licence was
replaced or legal approval inferred from the template/reference research.
