# Developer guide · 2.0

## Runtime

Four long-running services: Caddy, API, worker and PostgreSQL. A one-shot migration service creates the schema and a non-superuser `agent_app` role. The API and worker receive only the application database password; only the worker receives the model key. Neither has a host filesystem or Docker socket mount. The API reads a non-secret backup status file. Runtime containers are unprivileged, read-only, drop capabilities, and have memory/CPU/process limits.

PostgreSQL is the canonical queue and document/result store. Enqueue commits before HTTP 202. `FOR UPDATE SKIP LOCKED` claims one task per worker. A 30-second lease is renewed every two seconds. Actual worker heartbeats expire in the UI after 15 seconds. An expired running task is marked failed (or cancelled) by the API sweep or a worker; the API sweeps every five seconds even when all workers are offline. It is never automatically replayed. Multiple workers can be started with `--scale worker=N`. Idempotency prevents duplicate **submission**, not a universal exactly-once guarantee for external provider effects.

Cancellation signals an AbortController and records the final status after the worker stops. Aborting HTTP cannot guarantee the provider has stopped computation or billing. Partial artifacts and reported token counts remain available for inspection. Manual retry creates a new task with `parent_job_id`.

The assistant uses the Responses API with `store:false`, explicit function definitions, strict JSON schemas and an execution allowlist. All response output items, including encrypted reasoning, are carried forward during tool continuations. Each request's usage is accumulated only if the provider reports it. Tool calls are bounded by the model-step and time limits; artifact and document sizes are capped. No tool can execute code, issue arbitrary SQL, browse, or access arbitrary host paths. This limits consequences of prompt injection; it does not guarantee factual answers or prevent the model from reading any document in this shared workspace.

## HTTP contract

Authenticated endpoints accept `Authorization: Bearer <scoped-token>`. Browsers use an HttpOnly SameSite=Strict session plus `X-CSRF-Token` and an exact Origin match for mutations. Only the operator can manage documents and tokens. `ADMIN_TOKEN` is a break-glass administrative bearer credential; integrations should use scoped tokens.

| Method / path | Permission | Result |
| --- | --- | --- |
| GET /health/live | Public | 200 if API process responds |
| GET /health/ready | Public | 200 if DB and worker are ready; otherwise 503 |
| POST /api/auth/login | Exact Origin | `{key}` → session cookie and CSRF token |
| GET /api/auth/session | Authenticated | Operator/scopes context and CSRF token for browser sessions |
| POST /api/auth/logout | Authenticated + browser CSRF | Invalidates current session |
| GET /api/overview | tasks:read | Recorded counts, recent tasks, heartbeats, backup status |
| GET /api/tasks?status=&q=&offset= | tasks:read | Up to 30 task summaries and total |
| POST /api/tasks | tasks:write | `{kind:"assistant",prompt,title?}` or `{kind:"audit"}` → 202 after commit |
| GET /api/tasks/:id | tasks:read | Task record and artifact metadata |
| GET /api/tasks/:id/events?after=0 | tasks:read | Up to 250 ordered persisted events |
| POST /api/tasks/:id/cancel | tasks:write | 202; queued task cancels immediately, running task receives abort |
| POST /api/tasks/:id/retry | tasks:write | New linked task; only failed/cancelled tasks |
| GET /api/artifacts/:id | tasks:read | Plain text attachment |
| GET /api/documents[/:id] | documents:read | Document list / full document |
| POST /api/documents | Operator | `{title,content}` → 201; maximum 100 × 64 KiB |
| DELETE /api/documents/:id | Operator | Deletes current document; earlier results/backups may retain text |
| GET /api/tokens | Operator | Token metadata, never values or hashes |
| POST /api/tokens | Operator | `{name,scopes}` → token shown once |
| DELETE /api/tokens/:id | Operator | Immediate revocation |
| GET /api/recovery | Operator | Last verified backup / last failed attempt |
| GET /api/audit | Operator | Latest 50 access/operator events |

Use a unique `Idempotency-Key` (8–128 letters/digits or `._:-`) on task creation and retries. Reuse it for the same submission after a network failure. Identical replay returns 200 and the original task ID/summary; changed input returns 409. Submission responses never include saved results, so a write-only token cannot read them by replaying a request. The queue admits at most 100 unfinished tasks. All operator/API tokens belong to one shared workspace; there is no per-user or per-document tenancy. A token with tasks:write can ask the assistant to use any workspace document. Combining tasks:write with tasks:read can therefore reveal document-derived content in results even without the direct documents:read endpoint scope.

Errors return `{error,request_id}`. 400 invalid input, 401 no valid identity, 403 permission/origin/CSRF failure, 404 missing object, 409 conflict, 413 oversized request, 415 wrong content type, 429 rate/queue limit, 503 unavailable dependency. The reverse proxy may return its own plain-text 413 for oversized bodies. Callers must handle a failed HTTP request before parsing success data. A request accepted with 202 is not a finished task.

## MCP

`integrations/mcp/index.js` is an actual stdio MCP server using the official SDK. It advertises `submit_task`, `get_task`, `list_tasks`, `list_documents` and `read_document`; it performs authenticated requests to this API. It does not expose PostgreSQL credentials. Install its locked dependencies on the client machine with `npm ci`, use Node 22 or 24, and set `AGENTKIT_URL` and `AGENTKIT_TOKEN`. The provided client configs use an absolute local path; adjust it for your installation.

## Verification

Unit tests cover input boundaries and tool execution restrictions. `tests/acceptance.mjs` exercises authentication, permissions, durable execution, tool calls, cancellation, artifacts and errors against the running Docker app. The fixture implements the provider protocol deterministically; it does not establish compatibility with every model. Release tests additionally exercise outage recovery, backups, restore, the MCP transport and the browser. See RELEASE-ACCEPTANCE.md for actual results and remaining environment checks.
