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

## Validation evidence

| Area | Result |
| --- | --- |
| Application units | 12 pass, including eight worker lifecycle cases; the database-only test is separately executed against PostgreSQL and passes without skips. |
| API and worker | All 16 acceptance groups pass on the rebuilt stack and again from the extracted ZIP. |
| Integrations | Actual MCP initialization, discovery, submission, lookup, documents and invalid-argument handling pass. |
| Dashboard | Eight isolated regression groups; actual application workflows; all 16 axe/overflow views; authentication/rate/header-spoof checks pass. |
| Failure recovery | All six groups pass: interrupted upload, queue restart survival, lease expiry with workers offline, DB recovery, two-worker execution and restricted DB privileges. |
| Operations | All eight groups pass, including actual PostgreSQL dump, verified local rclone round trip, failure preservation, archive rejection, retention, installation and clean restore with token revocation. |
| Update/rollback | Actual v2 update produces a verified pre-update backup and preserves configuration/results/documents/tokens/readiness. Matching application/backup restored into a clean project recovers data and revokes tokens. This tests the current schema, not every future migration. |
| Marketing | Playback, chapters, eleven caption cues, seeking/replay, controls, checkout validation, media downloads/hashes and fallback paths pass; twelve axe/overflow combinations pass across four widths. |
| Repository | 18 locked TypeScript packages build/audit clean; 17 Python requirement sets audit clean; maintained offline suites, scanner regressions, selective Python lint, Compose validation and workflow actionlint pass. |
| Installer | Six regression groups pass under isolated root, plus independent review; syntax and systemd unit/dependency checks pass. Actual host timer firing remains untested. |
| Distribution | Exact 85-file ZIP passes strict manifest/checksum/mode verification, clean-state assertions, full API/MCP/browser/rate workflows, frontend regressions and the default installer without a model key or fixture override. |

Validated local archive: `kits/self-hosted-agent-kit/release/self-hosted-agent-kit-2.0.0.zip`.

SHA-256: `ad3c68780275d6efdf0b016ade4ae310fdae45e3ff61750f679197a3468c0244`.

Generated documentation, source digest and manifest match the packaged source. CI now runs recipe builds/offline tests/dependency audits, marketing checks, deterministic regressions, real token concurrency, update/rollback and extracted-package acceptance. Its checksum-verified image scanner fails for High/Critical matches and retains JSON evidence. Require complete green runs associated with the final PR head; the baseline failure and earlier-commit successes are not acceptance evidence for this change.

## Image inventory and nonblocking maintenance

Grype 0.120.1, valid database built `2026-10-11T06:30:42Z`, Linux amd64: app 3 Medium, PostgreSQL 4 Medium, Caddy 3 Medium, recipe Bash image 3 Medium; zero detected High/Critical and no scanner ignore rules. These are advisory/package match counts, not distinct exploits.

Remaining BusyBox wget header-injection matches require attacker-controlled raw-control-byte URLs; the kit's wget health URL is fixed and the recipe disables networking. PostgreSQL gosu's user-file parsing issue requires attacker-controlled system account files, which the kit does not mount or expose. These dispositions and upstream patch follow-up are retained in [IMAGE-SECURITY.md](../kits/self-hosted-agent-kit/docs/IMAGE-SECURITY.md).

Node 22.23.3 still embeds OpenSSL 3.5.8, which this scanner does not accurately inventory. The vendor High DTLS retransmission advisory does not map to an exposed Node API here: both DTLS protocol methods are rejected, and the application uses HTTPS/TCP with incoming TLS terminated by Caddy. Other vendor Low items and the need to adopt a patched supported Node release remain documented. Shared-library updates do not patch the embedded copy. No claim of zero vulnerabilities, complete security certification, arm64 validation or host/daemon patching is made.

## Public-launch blockers requiring owner configuration

1. Intended live OpenAI account/model smoke, with actual calculation tool call, saved artifact and measured usage.
2. Chosen Ubuntu/Debian host installation/restore, actual systemd timer firing, disk monitoring and external readiness monitoring.
3. Intended real domain/ACME or Tailscale access, encrypted cloud offsite backup/restore and demonstrated key recovery.
4. Approved checkout, price/tax/billing, purchase entitlement and exact ZIP delivery, published support/refund terms and purchaser licensing/distribution decisions, including earlier public grants.
5. Review/correction of separately hosted recipe/sales claims where applicable; this repository does not control an external CMS.

This environment supplied no live provider credentials, target-host/account configuration or approved storefront terms. Fixture Responses traffic, local rclone storage, static TLS configuration and unit validation do not close those gates. Preserve v1 separately; cut over only after validation, retaining the matching application, pre-update backup and separately secured secrets.
