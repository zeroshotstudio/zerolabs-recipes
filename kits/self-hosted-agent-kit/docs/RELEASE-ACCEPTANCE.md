# Release acceptance · Agent Kit 2.0.0

Reviewed and exercised on 2026-10-11 in an isolated Linux x86_64 Docker environment. This is a **release candidate for final deployment validation**, not a declaration that the existing live v1 service or paid storefront has been updated.

## Product delivered

A single-operator task workspace with a real bounded OpenAI Responses worker, durable PostgreSQL execution, measured worker/task telemetry, scoped API access, a local MCP bridge, document context, saved text artifacts, and recoverable workspace data. The application has no embedded checkout or simulated worker fleet. See the README for supported scope and limits.

The dashboard follows Linear's public design principles: a persistent sidebar and compact header, neutral surfaces, consistent alignment, clear type hierarchy, restrained accent color, and dense task rows. It includes dark/light themes, mobile navigation, keyboard access, task dialogs, search/filter/pagination, explicit loading/error/empty states, and visible partial/failure results. It does not ship or claim to be an official Linear design-system package.

## Locally verified

| Area | Evidence and result |
| --- | --- |
| Core boundaries and lifecycle | 12 unit tests pass: arithmetic parsing, tool/argument restrictions, task/URL validation and eight deterministic worker lifecycle cases. A separate actual PostgreSQL test passes concurrent token issuance at the 50-token cap and audit-failure rollback. |
| API and worker | 16 acceptance groups pass against the Docker application: authentication, CSRF, scopes, revocation, validation, idempotency, real queue execution, tool calls, measured usage, artifacts, failure handling, model-call/time limits, cancellation, retries and browser headers. |
| Failure recovery | 6 groups pass: interrupted fixture-upload cleanup, queued-job survival, killed-worker lease expiry while every worker is offline, without replay, DB-outage rejection/reconnection, concurrent work across two workers, and restricted application DB privileges. |
| MCP | An actual SDK client performs initialize, tool discovery, task submission, task lookup, document listing and invalid-argument rejection over stdio. |
| Dashboard regressions | Eight actual-browser regression groups pass: polling and delayed task/document responses preserve the current dialog, drafts and focus; skip-link activation preserves all six routes; completed document/token/task mutations preserve newer navigation; one-time token creation retains its result through a bounded pending state. |
| Browser | Chromium desktop at 1440 px and mobile emulation at 390/320 px pass task creation/completion, artifact download, document create/read/delete and HTML escaping, token create/revoke, filters, themes, command palette, navigation and logout. |
| Accessibility | All 16 tested views pass axe WCAG A/AA checks and page-overflow assertions. Light-theme, hover-state contrast and keyboard scrolling defects found during testing were corrected. This is automated evidence, not a complete accessibility certification or real-device Safari test. |
| Backup/recovery | A real pg_dump backup is validated, copied with rclone to a local offsite-test directory, downloaded and hash-checked, then restored into a separate Compose project. Known results and documents match; old sessions/tokens are invalidated. Corrupt/path-traversal archives and occupied restore targets are rejected. Failed backups retain older archives and publish failure state. |
| Update and rollback | A real v2 update takes a verified pre-update backup, copies the selected package, preserves configuration, results, documents and tokens, and becomes ready. Restoring the matching application and pre-update backup into a clean project recovers known data and revokes tokens. This is a same-schema rehearsal, not proof of arbitrary future migrations. |
| Installation | Six isolated-root regression groups cover fresh/same-directory/update ownership, UID 1000 mutation denial, unsafe ancestors and symlinks, inode/hardlink replacement, active backup locks, retained bytecode/PYTHONPATH injection and intentional unprivileged installation. Existing credentials and runtime data are preserved. Unrelated occupied destinations and in-place v1 upgrades are refused. |
| Edge/security | Private/public Caddy configurations adapt and validate with networking disabled. Public Compose replaces the loopback mapping while keeping API/DB ports internal. Login rate limits withstand spoofed client-IP headers. |
| Marketing | Playback, five chapters, eleven caption cues, replay, keyboard/touch controls, tabs/menu/FAQ, valid/invalid checkout settings, media hash/download integrity and no-JavaScript/blocked-media/no-range fallbacks pass. All twelve automated accessibility/overflow combinations at 1440/900/390/320 px pass. Screenshots and results are retained as CI evidence. |
| Repository recipes | All 18 TypeScript recipe packages have committed locks and pass install, compilation and dependency audits. All 17 declared Python requirement sets audit clean. Offline tests cover the real Docker shell boundary, descriptor-based file editor, honest computer-use protocol simulator, MCP and other maintained recipes. Eleven scanner regressions and independent re-audit pass. These recipes are outside the kit ZIP. |
| Scheduling | systemd service/timer syntax validates with a Docker dependency stub. This environment does not boot systemd as PID 1, so a real timer firing still belongs to target-host validation. |
| Dependencies and images | npm audits of runtime, MCP and test lockfiles report zero known vulnerabilities at test time. The patched app/PostgreSQL/Caddy image scans have no detected High/Critical matches, with 3/4/3 Medium matches retained and explained. The embedded Node OpenSSL inventory limit and upstream follow-up are documented in [IMAGE-SECURITY.md](IMAGE-SECURITY.md). Image scans do not establish that every component is vulnerability-free. |
| Distribution | The versioned ZIP is extracted into a fresh directory, checked against its SHA-256 manifest, installed in place, built with Docker, and subjected to API/MCP/browser acceptance. The package excludes secrets, runtime data, node_modules and build-proxy credentials. A clean installation starts with no synthetic tasks, workers or metrics. |

Reproducible commands live in `tests/` and `.github/workflows/agent-kit.yml`. The provider fixture is used only by `tests/compose.test.yml`; it is not part of production deployment. It exercises the Responses protocol and real local tool execution, but its generated answers are not live-model responses. The rclone test used a real local remote; it does not verify your cloud-storage account or crypt-key recovery.

## Changes from v1 that affect deployment

- Use a **separate v2 installation**. The old Redis queue, simulated agent rows, unprotected operational endpoints, credential downloads and embedded license gate have been removed.
- Imported legacy task rows are marked archived/unverified. No v1 "completed" status is promoted into proof of executed v2 work.
- Database results, documents, artifacts and task events now form one consistent backup source. Configuration secrets are kept separately in your password vault.
- Worker interruption never causes an automatic task replay. Manual retry can still incur new provider charges.
- The kit supports a built-in Responses worker. It does not install OpenClaw or execute OpenClaw agent sessions. External tools can use the scoped task API/MCP bridge.

## Audit closure and final evidence

The complete finding register, regression requirements, automation work and launch sequence are maintained in [AUDIT-FIX-RELEASE-PLAN.md](../../../AUDIT-FIX-RELEASE-PLAN.md). The original ten findings retain their identifiers; re-audit discoveries are added rather than omitted. A complete green workflow at the final release commit and its matching extracted ZIP remain required; earlier commits and pre-fix archives are insufficient. Image-scan and package evidence must refer to the final build.

## Remaining launch gates

1. **Live provider:** configure the intended real OpenAI account and model, recreate the worker, and run `./scripts/provider-smoke.sh`. It checks an actual calculation tool call and a saved artifact containing the expected answer. This workspace had no live provider key; no paid model call was performed.
2. **Target host:** run setup and a restore rehearsal on the chosen Ubuntu/Debian host; verify the systemd timer fires, disk monitoring works, and the external health monitor observes `/health/ready`. Docker tests do not certify a fresh VM's host setup.
3. **Network and storage:** verify the chosen Tailscale account/HTTPS setup or real domain/ACME issuance, and test the intended encrypted offsite remote. Static configuration and local remote tests do not replace these account-specific checks.
4. **Storefront:** test the actual payment, entitlement/download delivery, support contact and refund terms. The owner must settle commercial licensing/distribution expectations, including earlier public grants. No storefront account or checkout configuration was supplied for this work.
5. **Published recipe claims:** update any separately hosted articles or sales copy that still claim real desktop execution or stronger shell/file isolation than the corrected repository implementations. Repository changes do not update an external CMS.

No deployment to the existing host, merge to main, or public release publication is implied by these results. The old live service should remain isolated until deliberately replaced. The code, release archive, source digest and test evidence make the replacement reviewable and reproducible.
