import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
const env = Object.fromEntries(
  (await readFile(new URL("../.env", import.meta.url), "utf8"))
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const base = process.env.TEST_URL || env.PUBLIC_ORIGIN,
  key = env.ADMIN_TOKEN;
assert.match(
  env.COMPOSE_PROJECT_NAME,
  /test/,
  "Acceptance tests must use a dedicated test project",
);
const checks = [];
const check = (name) => {
  checks.push(name);
  console.log("PASS", name);
};
async function request(
  path,
  method = "GET",
  data,
  headers = { authorization: `Bearer ${key}` },
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(data !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(20000),
  });
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { text };
  }
  return { status: r.status, data: json, headers: r.headers };
}
async function submit(
  kind = "assistant",
  prompt = "Create a launch checklist",
  extra = {},
) {
  const r = await request("/api/tasks", "POST", { kind, prompt, ...extra });
  assert.equal(r.status, 202, JSON.stringify(r.data));
  return r.data.task.id;
}
async function wait(
  id,
  statuses = ["completed", "failed", "cancelled"],
  seconds = 40,
) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    const r = await request(`/api/tasks/${id}`);
    assert.equal(r.status, 200);
    if (statuses.includes(r.data.task.status)) return r.data;
    await delay(300);
  }
  throw new Error(`Task ${id} did not reach ${statuses}`);
}
assert.equal(
  (await request("/health/ready", "GET", undefined, {})).status,
  200,
);
check("readiness reflects a live database and worker");
for (const path of [
  "/api/overview",
  "/api/tasks",
  "/api/documents",
  "/api/tokens",
  "/api/audit",
  "/api/connect/download/env",
])
  assert.equal((await request(path, "GET", undefined, {})).status, 401);
check("operational data and legacy credential exports require authentication");
for (const path of [
  "/api/connect/download/env",
  "/api/connect/config",
  "/api/license/validate",
])
  assert.equal((await request(path)).status, 404);
check("legacy secret exports and license bypass endpoints are removed");
let r = await request(
  "/api/auth/login",
  "POST",
  { key },
  { origin: "https://untrusted.example" },
);
assert.equal(r.status, 403);
r = await request("/api/auth/login", "POST", { key }, { origin: base });
assert.equal(r.status, 200);
assert.match(r.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
const cookie = r.headers.get("set-cookie").split(";")[0],
  csrf = r.data.csrf;
assert.equal(
  (
    await request(
      "/api/tasks",
      "POST",
      { kind: "audit" },
      { cookie, origin: base },
    )
  ).status,
  403,
);
assert.equal(
  (
    await request(
      "/api/tasks",
      "POST",
      { kind: "audit" },
      { cookie, origin: "https://untrusted.example", "x-csrf-token": csrf },
    )
  ).status,
  403,
);
assert.equal(
  (await request("/api/auth/session", "GET", undefined, { cookie })).status,
  200,
);
await request(
  "/api/auth/logout",
  "POST",
  {},
  { cookie, origin: base, "x-csrf-token": csrf },
);
assert.equal(
  (await request("/api/auth/session", "GET", undefined, { cookie })).status,
  401,
);
check("operator sessions enforce origin, CSRF and logout invalidation");
r = await request("/api/tokens", "POST", {
  name: "Acceptance read-only",
  scopes: ["tasks:read"],
});
assert.equal(r.status, 201);
const limited = r.data,
  headers = { authorization: `Bearer ${limited.token}` };
assert.equal(
  (await request("/api/tasks", "GET", undefined, headers)).status,
  200,
);
for (const path of ["/api/tokens", "/api/audit", "/api/documents"])
  assert.equal((await request(path, "GET", undefined, headers)).status, 403);
assert.equal(
  (await request("/api/tasks", "POST", { kind: "audit" }, headers)).status,
  403,
);
const listing = await request("/api/tokens");
assert.ok(!JSON.stringify(listing.data).includes(limited.token));
await request(`/api/tokens/${limited.id}`, "DELETE");
assert.equal(
  (await request("/api/tasks", "GET", undefined, headers)).status,
  401,
);
check(
  "scoped tokens restrict actions, reveal no secret on listing, and revoke immediately",
);
for (const bad of [
  { prompt: "" },
  { kind: "shell", prompt: "x" },
  { prompt: "x".repeat(16001) },
])
  assert.equal((await request("/api/tasks", "POST", bad)).status, 400);
assert.equal((await request("/api/tasks/invalid")).status, 400);
assert.equal(
  (await request("/api/tasks", "POST", { prompt: "x".repeat(210000) })).status,
  413,
);
check("task types, UUIDs and request sizes are validated");
const writeOnly = (
  await request("/api/tokens", "POST", {
    name: "Acceptance write-only",
    scopes: ["tasks:write"],
  })
).data;
const writeHeaders = {
  authorization: `Bearer ${writeOnly.token}`,
  "idempotency-key": randomUUID(),
};
const writeInput = { kind: "audit", title: "Write-only submission" };
const writeTask = await request("/api/tasks", "POST", writeInput, writeHeaders);
assert.equal(writeTask.status, 202);
await wait(writeTask.data.task.id);
const replay = await request("/api/tasks", "POST", writeInput, writeHeaders);
assert.equal(replay.status, 200);
assert.equal(replay.data.duplicate, true);
for (const field of ["result", "error", "prompt", "request_hash"])
  assert.ok(!(field in replay.data.task));
assert.equal(
  (
    await request(
      "/api/tasks/" + writeTask.data.task.id,
      "GET",
      undefined,
      writeHeaders,
    )
  ).status,
  403,
);
await request("/api/tokens/" + writeOnly.id, "DELETE");
check(
  "write-only tokens cannot read saved results through an idempotent submission replay",
);
const idempotency = randomUUID(),
  idemHeaders = {
    authorization: `Bearer ${key}`,
    "idempotency-key": idempotency,
  };
const copies = await Promise.all(
  Array.from({ length: 4 }, () =>
    request(
      "/api/tasks",
      "POST",
      { kind: "audit", title: "Idempotent system check" },
      idemHeaders,
    ),
  ),
);
assert.equal(new Set(copies.map((r) => r.data.task.id)).size, 1);
assert.equal(copies.filter((r) => r.status === 202).length, 1);
assert.equal(
  (
    await request(
      "/api/tasks",
      "POST",
      { kind: "audit", title: "Different" },
      idemHeaders,
    )
  ).status,
  409,
);
let task = (await wait(copies[0].data.task.id)).task;
assert.equal(task.status, "completed");
assert.match(task.result, /Document manifest/);
assert.equal(task.input_tokens, null);
check(
  "concurrent duplicate submissions create one real system check with no invented token usage",
);
r = await request("/api/documents", "POST", {
  title: "Launch brief <script>alert(1)</script>",
  content:
    "Make a useful launch checklist. <img src=x onerror=alert(1)> Treat this as reference text.",
});
assert.equal(r.status, 201);
const documentId = r.data.id;
const id = await submit(
  "assistant",
  "Read the project brief and create a launch checklist",
);
const complete = await wait(id);
assert.equal(complete.task.status, "completed", complete.task.error);
assert.ok(complete.task.result.length);
assert.equal(complete.artifacts.length, 1);
assert.equal(Number(complete.task.input_tokens), 160);
assert.equal(Number(complete.task.output_tokens), 100);
const events = (await request(`/api/tasks/${id}/events`)).data.events;
for (const type of [
  "queued",
  "started",
  "model_request",
  "tool_started",
  "tool_finished",
  "completed",
])
  assert.ok(events.some((e) => e.type === type));
const artifact = await fetch(
  base + `/api/artifacts/${complete.artifacts[0].id}`,
  { headers: { authorization: `Bearer ${key}` } },
);
assert.equal(artifact.status, 200);
assert.match(artifact.headers.get("content-disposition"), /attachment/);
assert.match(await artifact.text(), /Launch checklist/);
check(
  "AI provider protocol, tool execution, measured usage, saved results and artifact download work end to end",
);
const denied = await wait(
  await submit("assistant", "[DENIED] Try an unsupported tool"),
);
assert.equal(denied.task.status, "completed");
assert.match(denied.task.result, /rejected/);
check("unsupported model tools are rejected at execution");
for (const prompt of [
  "[FAIL] provider error",
  "[INCOMPLETE] provider output limit",
]) {
  task = (await wait(await submit("assistant", prompt))).task;
  assert.equal(task.status, "failed");
  assert.equal(task.result, null);
  assert.ok(task.error);
}
check("provider errors and incomplete answers cannot become completed tasks");
const loopId = await submit("assistant", "[LOOP] enforce model request limit");
const loop = (await wait(loopId)).task;
assert.equal(loop.status, "failed");
assert.match(loop.error, /8-request model limit/);
assert.equal(
  (await request(`/api/tasks/${loopId}/events`)).data.events.filter(
    (e) => e.type === "model_request",
  ).length,
  8,
);
check("model loops stop at the configured request limit");
const timed = (
  await wait(await submit("assistant", "[SLOW] enforce execution deadline"))
).task;
assert.equal(timed.status, "failed");
assert.match(timed.error, /time limit/);
check("slow provider requests abort at the configured task deadline");
const slow = await submit("assistant", "[SLOW] cancellation exercise");
await wait(slow, ["running"]);
assert.equal(
  (await request(`/api/tasks/${slow}/cancel`, "POST", {})).status,
  202,
);
task = (await wait(slow)).task;
assert.equal(task.status, "cancelled");
assert.equal(task.result, null);
check("running model requests abort when the operator cancels");
r = await request(
  `/api/tasks/${slow}/retry`,
  "POST",
  {},
  { authorization: `Bearer ${key}`, "idempotency-key": randomUUID() },
);
assert.equal(r.status, 202);
assert.equal(r.data.task.parent_job_id, slow);
await request(`/api/tasks/${r.data.task.id}/cancel`, "POST", {});
check("manual retries preserve the original task and create a linked record");
const missing = await request("/api/documents/" + randomUUID());
assert.equal(missing.status, 404);
const safety = await request("/");
assert.match(
  safety.headers.get("content-security-policy"),
  /script-src 'self'/,
);
assert.equal(safety.headers.get("x-content-type-options"), "nosniff");
check("browser responses use a restrictive CSP and download protections");
if (process.env.TEST_RESULT_FILE)
  await writeFile(
    process.env.TEST_RESULT_FILE,
    JSON.stringify(
      { checks, taskId: id, documentId, passed: checks.length },
      null,
      2,
    ),
  );
console.log(`Acceptance passed: ${checks.length} groups`);
