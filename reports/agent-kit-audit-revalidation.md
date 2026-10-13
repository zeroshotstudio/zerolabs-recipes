# Agent Kit release audit revalidation

Date: 2026-10-11 UTC. Baseline: `85c24b7301a64fbe1714a4bf9483e83e334b4968`, branch `codex/agent-kit-overhaul`, [PR #1](https://github.com/zeroshotstudio/zerolabs-recipes/pull/1). This report accompanies the remediation source in the same commit; the complete register is [AUDIT-FIX-RELEASE-PLAN.md](../AUDIT-FIX-RELEASE-PLAN.md).

**Code result: no known blocking defect remains in the reviewed changes and tested scope. Public launch: HOLD pending the account/deployment gates below and complete final-head CI.** No live paid model call, production deployment, storefront transaction, merge or public publication was performed.

## Original findings

| ID | Revalidation result |
| --- | --- |
| 1 | Root installation normalizes trust, replaces formerly writable inodes, refuses unsafe ancestors/symlinks and preserves private credentials, runtime data and active backup locks. Six isolated-root regression groups and independent installer review pass. Deliberate unprivileged installation remains supported. |
| 2 | Heartbeats capture their execution and only affect the same current execution; fresh lease validation gates the runner. Delayed idle and previous-task failures cannot abort a successor. Actual-worker regression tests and real outage/two-worker checks pass. |
| 3 | Shutdown after a claim prevents new provider work. Never-executed claims return safely or preserve cancellation; started work is never automatically replayed. Deterministic claim/renewal/shutdown regressions pass. |
| 4 | Dialog mode/version and request sequencing prevent task polling and stale responses from replacing retry confirmation or the palette. Focus and same-task reopening checks pass. |
| 5 | Keyboard skip-link activation focuses main without altering any of the six current routes. Actual-browser regressions pass. |
| 6 | Token count, issuance and audit share one advisory-locked transaction. Actual PostgreSQL accepts exactly one of eight requests from an initial count of 49; forced audit failure rolls back creation. |
| 7 | Both shell examples require resource-limited Docker isolation, verify nonroot/network/cgroup boundaries, bound streaming output and remove whole containers on deadline. Host fallback and unsafe probe evaluation are removed. Ten Python and six TypeScript tests pass with actual Docker and the patched sandbox image. |
| 8 | Both editors use canonical ancestry and descriptor-anchored no-follow operations, reject hardlinks/special files and require a private single-writer workspace. Ten Python and ten TypeScript tests pass; independent review confirms the documented scope and platform limits. |
| 9 | Scanner handles current provider formats, exact placeholder exemptions, redacted paths/results, Unicode/binary contents, literal staged filenames and fail-closed errors. Eleven regressions and separate reviewer reproductions pass. Final repository and staged scans are required before commit. |
| 10 | Recipes 23/25 lock MCP SDK 1.32.1. Locked installs, TypeScript builds, npm audits and actual offline stdio smoke tests pass. |

## Re-audit discoveries

- N1: Retained sourceless Python caches and inherited `PYTHONPATH` could execute under a root helper. Isolated Python invocation and trusted retained-cache handling block the reproduced path; the actual backup entrypoint regression passes.
- N2: Delayed Docker creation could outlive a cleanup absence check. Explicit create acknowledgement now gates starting model code; delayed-create regressions pass and uncertain stopped metadata is reported.
- N3: Credential-bearing filenames and UTF-16 text bypassed output/encoding assumptions. Filename redaction and BOM-aware/fail-closed decoding pass independent probes.
- N4: Previously untested TypeScript errors in Recipes 14/16 and missing Recipe 21 build configuration are corrected; all 18 packages compile.
- N5: Recipe 21 now honestly describes a protocol simulator, including its placeholder screenshot and absent isolation/approval controls. Dispatch, endpoint and PNG defects are fixed; Python mock-loop and TypeScript offline smoke pass. Historical repository claims are corrected; separately published pages still need owner review.
- N6: Release verification now derives the version and checks exact membership, regular-file modes, sizes, hashes, manifest version, external checksums and digest equality. The stale ZIP has been replaced and the new extracted ZIP tested.
- N7: Patched image builds remove unnecessary application tooling, apply exact Alpine OpenSSL/zlib fixes, and rebuild Caddy with locked Go 1.27.2/x-net 0.60.0. Fresh scans of actual images have no detected High/Critical matches. Residual inventory and upstream work remain explicitly documented below.
- N8: Additional document/token/task completion races could overwrite newer navigation and drafts. Context guards and a bounded pending token dialog preserve current views and the one-time token result. Eight frontend groups and independent reproductions pass.
- N9: A staged `0:` filename could resolve to a different clean Git blob. Explicit index stage addressing and literal filename/type-change regressions close the ambiguity.
- N10: Live article review exposed further unsupported Recipe 20 timing/token claims and misleading current-model compatibility wording. The repository article now uses qualitative claims and labels its API examples historical. Prepared CMS updates for all three affected articles also correct stale FAQ/HowTo/SEO metadata; authentication and actual application/readback remain required.
- N11: The live-provider smoke could emit a passing receipt with incomplete usage. It now requires safe measured usage for every response, reconciles canonical PostgreSQL decimal-string task totals, rejects unsafe or zero combined usage, and records the response count. All 24 regressions execute the actual smoke script's JavaScript and pass.
- N12: The kit license's blanket warranty disclaimer is replaced with an explicit preservation of non-excludable Australian and applicable overseas consumer rights, defect remedies, required updates and express sales commitments. Three checks against official sources support this correction; they are not a legal enforceability certification. Existing permission grants and earlier public grants are preserved.
- N13 (open external gate): Separately deployed legal pages still give stale Berlin/contact details, and the site's global layout initializes GA4 without a consent condition. The observed analytics, contact/newsletter storage and optional Turnstile flows require an accurate privacy notice, applicability/transfer review and actual tracking/consent verification. A reviewable application patch and data inventory are prepared separately; no live application deployment has occurred.

## Validation evidence

| Area | Result |
| --- | --- |
| Application units | 12 pass, including eight worker lifecycle cases; the database-only test is separately executed against PostgreSQL and passes without skips. |
| Provider receipt | 24 actual-script offline regressions pass, including valid PostgreSQL string totals, missing usage/models, invalid numbers, mismatched aggregates, overflow and incorrect output. No paid model call was performed. |
| API and worker | All 16 acceptance groups pass on the rebuilt stack and again from the extracted ZIP. |
| Integrations | Actual MCP initialization, discovery, submission, lookup, documents and invalid-argument handling pass. |
| Dashboard | Eight isolated regression groups; actual application workflows; all 16 axe/overflow views; authentication/rate/header-spoof checks pass. |
| Failure recovery | All six groups pass: interrupted upload, queue restart survival, lease expiry with workers offline, DB recovery, two-worker execution and restricted DB privileges. |
| Operations | All eight groups pass, including actual PostgreSQL dump, verified local rclone round trip, failure preservation, archive rejection, retention, installation and clean restore with token revocation. |
| Update/rollback | Actual v2 update produces a verified pre-update backup and preserves configuration/results/documents/tokens/readiness. Matching application/backup restored into a clean project recovers data and revokes tokens. This tests the current schema, not every future migration. |
| Marketing | Playback, chapters, eleven caption cues, seeking/replay, controls, checkout validation, media downloads/hashes and fallback paths pass; twelve axe/overflow combinations pass across four widths. |
| Repository | 18 locked TypeScript packages build/audit clean; 17 Python requirement sets audit clean; maintained offline suites, scanner regressions, selective Python lint, Compose validation and workflow actionlint pass. |
| Installer | Six regression groups pass under isolated root, plus independent review; syntax and systemd unit/dependency checks pass. Actual host timer firing remains untested. |
| Distribution | The initial 85-file archive passed strict verification and full extracted API/MCP/browser/rate/frontend/default-installer acceptance. The follow-up 86-file archive includes the revised license, support contact and provider-receipt regression; it passes strict verification and that regression from the extracted bundle. Final-head CI must repeat complete runtime and extracted-package acceptance for the latest archive. |

Validated local archive: `kits/self-hosted-agent-kit/release/self-hosted-agent-kit-2.0.0.zip`.

Follow-up archive SHA-256: `6a2f13f9385a4ebfc5d1dedef07b5975d0ff8aaabe67c7bfe7efbd48f7d79b39`.

Initial acceptance at `662c74ea67fcaf84c11fe53817a71bcf721e5b3d` had green Recipes CI [38138527167](https://github.com/zeroshotstudio/zerolabs-recipes/actions/runs/38138527167) and Agent Kit acceptance [38138527172](https://github.com/zeroshotstudio/zerolabs-recipes/actions/runs/38138527172). Its CI product ZIP was byte-identical to the initial local archive (`ad3c68780275d6efdf0b016ade4ae310fdae45e3ff61750f679197a3468c0244`). These runs remain historical evidence; the follow-up source and archive require their own final-head CI.

Generated documentation, source digest and manifest match the packaged source. CI now runs recipe builds/offline tests/dependency audits, marketing checks, deterministic regressions, real token concurrency, update/rollback and extracted-package acceptance. Its checksum-verified image scanner fails for High/Critical matches and retains JSON evidence. Require complete green runs associated with the final PR head; the baseline failure and earlier-commit successes are not acceptance evidence for this change.

## Image inventory and nonblocking maintenance

Grype 0.120.1, valid database built `2026-10-11T06:30:42Z`, Linux amd64: app 3 Medium, PostgreSQL 4 Medium, Caddy 3 Medium, recipe Bash image 3 Medium; zero detected High/Critical and no scanner ignore rules. These are advisory/package match counts, not distinct exploits.

Remaining BusyBox wget header-injection matches require attacker-controlled raw-control-byte URLs; the kit's wget health URL is fixed and the recipe disables networking. PostgreSQL gosu's user-file parsing issue requires attacker-controlled system account files, which the kit does not mount or expose. These dispositions and upstream patch follow-up are retained in [IMAGE-SECURITY.md](../kits/self-hosted-agent-kit/docs/IMAGE-SECURITY.md).

Node 22.23.3 still embeds OpenSSL 3.5.8, which this scanner does not accurately inventory. The vendor High DTLS retransmission advisory does not map to an exposed Node API here: both DTLS protocol methods are rejected, and the application uses HTTPS/TCP with incoming TLS terminated by Caddy. Other vendor Low items and the need to adopt a patched supported Node release remain documented. Shared-library updates do not patch the embedded copy. No claim of zero vulnerabilities, complete security certification, arm64 validation or host/daemon patching is made.

## Public-launch blockers requiring owner configuration

1. Intended live OpenAI account/model smoke, with actual calculation tool call, saved artifact and measured usage.
2. Chosen Ubuntu/Debian host installation/restore, actual systemd timer firing, disk monitoring and external readiness monitoring.
3. Intended real domain/ACME or Tailscale access, encrypted cloud offsite backup/restore and demonstrated key recovery.
4. Approved checkout, price/tax/billing, purchase entitlement and exact ZIP delivery, published terms and functioning refund/withdrawal flow. The owner supplied an Australian seller identity/contact and selected worldwide sales including the EU; mandatory overseas protections remain applicable. Storefront contracting identity, telephone information where required, tax roles, actual privacy/consent and EU representation/accessibility applicability must match the operating setup. Preserve earlier public grants.
5. Application and verification of prepared live Recipe 19/20/21 corrections, plus the separately hosted legal/privacy pages. Public checks found all three articles stale, and existing legal pages still contain outdated Berlin/contact details. Repository corrections and staged payloads do not update live content.

Australian base sales terms, a German/EU consumer addendum, statutory withdrawal
notice/form, privacy preparation, primary sources and end-to-end commerce checks
are versioned under [marketing/agent-kit/legal](../marketing/agent-kit/legal/README.md).
They received three drafting/source passes and remain explicitly prelaunch until
actual seller/checkout/data facts and operational evidence are complete. No
all-country legal-validity certification, approved price or invented contact is
claimed.

The owner identified ZeroVPS as the access route. Its documented SSH/MCP routes require secure runtime connection bindings, which are absent from this session; GitHub repository access is not live-host or CMS authentication. The environment also has no live provider, backup or storefront credentials. Fixture Responses traffic, local rclone storage, static TLS configuration and unit validation do not close those gates. Preserve v1 separately; cut over only after validation, retaining the matching application, pre-update backup and separately secured secrets.

## Follow-up evidence — 2026-10-13

The product source at `a11ea1df388e21e774503ea9fe5618e3ffec39b0` has green
[Recipes CI 38155576402](https://github.com/zeroshotstudio/zerolabs-recipes/actions/runs/38155576402)
and [Agent Kit acceptance 38155576396](https://github.com/zeroshotstudio/zerolabs-recipes/actions/runs/38155576396).
The latter CI archive is byte-identical to the 86-file local ZIP with SHA-256
`6a2f13f9385a4ebfc5d1dedef07b5975d0ff8aaabe67c7bfe7efbd48f7d79b39`.
The October 13 follow-up changes only audit documentation in this repository;
kit source and packaged bytes are unchanged.

The owner selected Lemon Squeezy. The actual website source implementation is in
[ZeroLabs PR #24](https://github.com/zeroshotstudio/ZeroLabs/pull/24): checkout and
immutable terms, signed canonical orders, private exact-ZIP delivery/redelivery,
two-step withdrawal/dated acknowledgment with durable email retries, explicitly
assigned operator refunds without automatic financial replay, and outside-form
withdrawal/support recording. Prepared identity/tracking fixes, prominent request
links, secret/private-build exclusions and safe article-correction tooling are integrated.

Local evidence: 35 passing PostgreSQL commerce cases, HTTP permissions/origin/receipt
checks, atomic CMS precondition/readback checks, desktop and two mobile browser widths
with zero axe A/AA violations or overflow, production build, 21 existing content suites
and eight public MCP security/protocol groups. Detailed scope and live activation
instructions are versioned in the site's commerce validation/configuration documents.
These fixtures performed no live provider transaction or email.

N14 records the separately hosted site's production dependency findings: baseline
3 Critical/50 High/88 Moderate/16 Low advisory records, corrected to zero production
npm advisories through compatible upgrades, transitive pins and removal of a development
CLI from runtime dependencies. N15 retains one unpatched High braces development-only
advisory, GHSA-vfj7-8cjw-p6xm, through ESLint/fast-glob/shadcn. It is absent from the
production graph and inspected standalone output; trusted build patterns only, adopt
an upstream fix when published. This is not an OS image scan or a clean full-development
dependency claim.

N13 stays open for actual deployment/privacy/account verification. No authenticated
ZeroVPS/CMS, Lemon Squeezy or email runtime bindings are available here. Actual approved
price/currency, merchant/legal/privacy facts, sender setup, host migration/deployment,
private files, retry timer monitoring, live article corrections/readback and real
purchase/download/withdrawal/refund acceptance remain required. All original findings
and account/deployment gates above remain in the register; none are omitted.
