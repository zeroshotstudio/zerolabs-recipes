import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
const exec = promisify(execFile),
  root = new URL("..", import.meta.url).pathname;
const env = Object.fromEntries(
  (await readFile(root + ".env", "utf8"))
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
assert.match(
  env.COMPOSE_PROJECT_NAME,
  /test/,
  "Resilience tests must use a dedicated test project",
);
const base = env.PUBLIC_ORIGIN,
  headers = {
    authorization: `Bearer ${env.ADMIN_TOKEN}`,
    "content-type": "application/json",
  };
const childEnv = { ...process.env };
for (const k of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete childEnv[k];
async function compose(...args) {
  return exec(
    "docker",
    [
      "--host=unix:///var/run/docker.sock",
      "compose",
      "-f",
      "docker-compose.yml",
      "-f",
      "tests/compose.test.yml",
      ...args,
    ],
    { cwd: root, env: childEnv, maxBuffer: 2 * 1024 * 1024 },
  );
}
async function request(path, method = "GET", body) {
  const r = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  return { status: r.status, data: await r.json() };
}
async function until(fn, seconds = 45) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    const v = await fn();
    if (v) return v;
    await delay(500);
  }
  throw new Error("Condition timed out");
}
try {
  await compose("stop", "worker");
  const queued = await request("/api/tasks", "POST", {
    kind: "audit",
    title: "Survives worker restart",
  });
  assert.equal(queued.status, 202);
  await delay(1000);
  assert.equal(
    (await request("/api/tasks/" + queued.data.task.id)).data.task.status,
    "queued",
  );
  assert.equal((await request("/health/ready")).status, 503);
  await compose("up", "-d", "--no-deps", "worker");
  await until(async () => {
    const t = (await request("/api/tasks/" + queued.data.task.id)).data.task;
    return t.status === "completed" && t;
  });
  console.log(
    "PASS queued work survives worker restart; missing heartbeat degrades readiness",
  );
  const slow = (
    await request("/api/tasks", "POST", {
      kind: "assistant",
      prompt: "[SLOW] exercise worker crash",
    })
  ).data.task;
  await until(
    async () =>
      (await request("/api/tasks/" + slow.id)).data.task.status === "running",
  );
  await compose("kill", "-s", "SIGKILL", "worker");
  await compose("stop", "worker");
  const interrupted = await until(async () => {
    const t = (await request("/api/tasks/" + slow.id)).data.task;
    return t.status === "failed" && t;
  });
  assert.equal(interrupted.result, null);
  assert.match(interrupted.error, /interrupted/);
  const events = (await request(`/api/tasks/${slow.id}/events`)).data.events;
  assert.equal(events.filter((e) => e.type === "started").length, 1);
  console.log(
    "PASS API expires killed execution while every worker is offline, without replay",
  );
  assert.equal(
    (await request("/api/overview")).data.workers.filter((w) => w.online)
      .length,
    0,
  );
  await compose("up", "-d", "--no-deps", "worker");
  await until(async () => (await request("/health/ready")).status === 200);
  await compose("stop", "postgres");
  const unavailable = await request("/api/tasks", "POST", { kind: "audit" });
  assert.equal(unavailable.status, 503);
  assert.equal((await request("/health/ready")).status, 503);
  await compose("start", "postgres");
  await until(async () => {
    try {
      return (await request("/health/ready")).status === 200;
    } catch {
      return false;
    }
  });
  console.log(
    "PASS database outage rejects new work and readiness; recovery reconnects",
  );
  await compose("up", "-d", "--no-deps", "--scale", "worker=2", "worker");
  await until(
    async () =>
      (await request("/api/overview")).data.workers.filter((w) => w.online)
        .length === 2,
  );
  const submitted = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      request("/api/tasks", "POST", {
        kind: "assistant",
        prompt: "[PLAIN] [CONCURRENT] Concurrent task " + i,
      }),
    ),
  );
  const tasks = [];
  for (const r of submitted) {
    assert.equal(r.status, 202);
    const id = r.data.task.id;
    tasks.push(
      await until(async () => {
        const t = (await request("/api/tasks/" + id)).data.task;
        return t.status === "completed" && t;
      }),
    );
    const trace = (await request(`/api/tasks/${id}/events`)).data.events;
    assert.equal(trace.filter((e) => e.type === "started").length, 1);
  }
  assert.equal(new Set(tasks.map((t) => t.worker_id)).size, 2);
  console.log(
    "PASS two workers claim concurrent jobs once each and both persist results",
  );
  // Runtime role must not be able to create tables or act as superuser.
  const role = await compose(
    "exec",
    "-T",
    "api",
    "node",
    "--input-type=module",
    "-e",
    `import {createPool} from './lib/db.js';const p=createPool();const r=await p.query("SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user");if(Object.values(r.rows[0]).some(Boolean))process.exit(2);try{await p.query('CREATE TABLE should_be_denied(id int)');process.exit(3)}catch(e){if(e.code!=='42501')process.exit(4)}await p.end();console.log('runtime privileges restricted')`,
  );
  assert.match(role.stdout, /restricted/);
  console.log(
    "PASS application database role has no superuser, role, database or table-creation privileges",
  );
} finally {
  await compose("start", "postgres").catch(() => {});
  await compose("up", "-d", "--no-deps", "--scale", "worker=1", "worker").catch(
    () => {},
  );
}
