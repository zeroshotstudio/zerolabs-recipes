# Release acceptance · Agent Kit 2.0.0

Reviewed and exercised on 2026-10-08 in an isolated Linux x86_64 Docker environment. This is a **release candidate for final deployment validation**, not a declaration that the existing live v1 service or paid storefront has been updated.

## Product delivered

A single-operator task workspace with a real bounded OpenAI Responses worker, durable PostgreSQL execution, measured worker/task telemetry, scoped API access, a local MCP bridge, document context, saved text artifacts, and recoverable workspace data. The application has no embedded checkout or simulated worker fleet. See the README for supported scope and limits.

The dashboard follows Linear's public design principles: a persistent sidebar and compact header, neutral surfaces, consistent alignment, clear type hierarchy, restrained accent color, and dense task rows. It includes dark/light themes, mobile navigation, keyboard access, task dialogs, search/filter/pagination, explicit loading/error/empty states, and visible partial/failure results. It does not ship or claim to be an official Linear design-system package.

## Locally verified

| Area | Evidence and result |
| --- | --- |
| Core boundaries | 4 unit tests pass: arithmetic parsing, tool allowlist/argument rejection, task validation and URL restrictions. |
| API and worker | 16 acceptance groups pass against the Docker application: authentication, CSRF, scopes, revocation, validation, idempotency, real queue execution, tool calls, measured usage, artifacts, failure handling, model-call/time limits, cancellation, retries and browser headers. |
| Failure recovery | 5 groups pass: queued-job survival, killed-worker lease expiry while every worker is offline, without replay, DB-outage rejection/reconnection, concurrent work across two workers, and restricted application DB privileges. |
| MCP | An actual SDK client performs initialize, tool discovery, task submission, task lookup, document listing and invalid-argument rejection over stdio. |
| Browser | Chromium desktop at 1440 px and mobile emulation at 390/320 px pass task creation/completion, artifact download, document create/read/delete and HTML escaping, token create/revoke, filters, themes, command palette, navigation and logout. |
| Accessibility | All 16 tested views pass axe WCAG A/AA checks and page-overflow assertions. Light-theme, hover-state contrast and keyboard scrolling defects found during testing were corrected. This is automated evidence, not a complete accessibility certification or real-device Safari test. |
| Backup/recovery | A real pg_dump backup is validated, copied with rclone to a local offsite-test directory, downloaded and hash-checked, then restored into a separate Compose project. Known results and documents match; old sessions/tokens are invalidated. Corrupt/path-traversal archives and occupied restore targets are rejected. Failed backups retain older archives and publish failure state. |
| Installation | Fresh and same-directory setup preserve executable modes, .env.example and existing private credentials. Source .env is excluded. Unrelated occupied destinations and in-place v1 upgrades are refused. |
| Edge/security | Private/public Caddy configurations adapt and validate with networking disabled. Public Compose replaces the loopback mapping while keeping API/DB ports internal. Login rate limits withstand spoofed client-IP headers. |
| Scheduling | systemd service/timer syntax validates with a Docker dependency stub. This environment does not boot systemd as PID 1, so a real timer firing still belongs to target-host validation. |
| Dependencies | npm audits of runtime, MCP and test lockfiles report zero known vulnerabilities at test time. Images are pinned by digest. This does not establish that every OS image component is vulnerability-free. |
| Distribution | The versioned ZIP is extracted into a fresh directory, checked against its SHA-256 manifest, installed in place, built with Docker, and subjected to API/MCP/browser acceptance. The package excludes secrets, runtime data, node_modules and build-proxy credentials. A clean installation starts with no synthetic tasks, workers or metrics. |

Reproducible commands live in `tests/` and `.github/workflows/agent-kit.yml`. The provider fixture is used only by `tests/compose.test.yml`; it is not part of production deployment. It exercises the Responses protocol and real local tool execution, but its generated answers are not live-model responses. The rclone test used a real local remote; it does not verify your cloud-storage account or crypt-key recovery.

## Changes from v1 that affect deployment

- Use a **separate v2 installation**. The old Redis queue, simulated agent rows, unprotected operational endpoints, credential downloads and embedded license gate have been removed.
- Imported legacy task rows are marked archived/unverified. No v1 "completed" status is promoted into proof of executed v2 work.
- Database results, documents, artifacts and task events now form one consistent backup source. Configuration secrets are kept separately in your password vault.
- Worker interruption never causes an automatic task replay. Manual retry can still incur new provider charges.
- The kit supports a built-in Responses worker. It does not install OpenClaw or execute OpenClaw agent sessions. External tools can use the scoped task API/MCP bridge.

## Remaining launch gates

1. **Live provider:** configure the intended real OpenAI account and model, recreate the worker, and run `./scripts/provider-smoke.sh`. It checks an actual calculation tool call and a saved artifact containing the expected answer. This workspace had no live provider key; no paid model call was performed.
2. **Target host:** run setup and a restore rehearsal on the chosen Ubuntu/Debian host; verify the systemd timer fires, disk monitoring works, and the external health monitor observes `/health/ready`. Docker tests do not certify a fresh VM's host setup.
3. **Network and storage:** verify the chosen Tailscale account/HTTPS setup or real domain/ACME issuance, and test the intended encrypted offsite remote. Static configuration and local remote tests do not replace these account-specific checks.
4. **Storefront:** test the actual payment, entitlement/download delivery, support contact and refund terms. The owner must settle commercial licensing/distribution expectations, including earlier public grants. No storefront account or checkout configuration was supplied for this work.

No deployment to the existing host, merge to main, or public release publication is implied by these results. The old live service should remain isolated until deliberately replaced. The code, release archive, source digest and test evidence make the replacement reviewable and reproducible.
