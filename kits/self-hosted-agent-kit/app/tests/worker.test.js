import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transaction } from "../lib/db.js";

const source = (
  await readFile(new URL("../worker.js", import.meta.url), "utf8")
).replace(/^import[\s\S]*?from "[^"]+";\n/gm, "");

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function worker(overrides = {}) {
  const hooks = new Map(),
    events = [],
    completions = [],
    returned = [];
  let heartbeat,
    heartbeatCalls = 0,
    claims = 0,
    ended = false;
  const stop = () => hooks.get("SIGTERM")();
  const pool = {
    async query(sql, values) {
      if (sql.startsWith("INSERT INTO workers"))
        return overrides.heartbeat?.(++heartbeatCalls) ?? {};
      if (sql.startsWith("UPDATE jobs SET lease_until"))
        return (
          overrides.renew?.(values[0]) ?? {
            rowCount: 1,
            rows: [{ cancel_requested: false }],
          }
        );
      if (sql.startsWith("SELECT cancel_requested"))
        return { rows: [{ cancel_requested: false }] };
      if (sql.includes("worker_id=NULL,started_at=NULL")) {
        returned.push(values[0]);
        return {
          rows: [{ status: overrides.cancelled ? "cancelled" : "queued" }],
        };
      }
      if (sql.startsWith("UPDATE jobs SET status=$2")) {
        completions.push({
          id: values[0],
          status: values[1],
          error: values[3],
        });
        overrides.completed?.(values[0]);
      }
      return {};
    },
    async connect() {
      return { query: pool.query, release() {} };
    },
    async end() {
      ended = true;
    },
  };
  const context = {
    randomUUID: () => "worker-1",
    createPool: () => pool,
    transaction,
    event: async (_db, id, type, message) => events.push({ id, type, message }),
    VERSION: "2.0.0",
    integer: (_value, fallback) => fallback,
    providerURL() {},
    writeFile: async () => {},
    unlink: async () => {},
    delay: async (ms) => overrides.delay?.(ms),
    claim: async () => overrides.claim(++claims),
    runTask: (...args) => overrides.run(...args),
    closeRunner: async () => {},
    setInterval(fn) {
      heartbeat = fn;
      return 1;
    },
    clearInterval() {},
    setTimeout: () => 1,
    clearTimeout() {},
    AbortController,
    process: { env: {}, on: (name, fn) => hooks.set(name, fn) },
    console: { log() {}, error() {} },
  };
  const done = vm.runInNewContext(`(async () => {\n${source}\n})()`, context);
  return {
    done,
    stop,
    tick: () => heartbeat(),
    events,
    completions,
    returned,
    get ended() {
      return ended;
    },
  };
}

test("a delayed idle heartbeat failure cannot interrupt a newly verified task", async () => {
  const claim = deferred(),
    stale = deferred(),
    started = deferred(),
    finish = deferred();
  let signal;
  const h = worker({
    claim: () => claim.promise,
    heartbeat: (call) => (call === 2 ? stale.promise : {}),
    run: async (_pool, _task, _id, current) => {
      signal = current;
      started.resolve();
      await finish.promise;
      return "healthy result";
    },
    completed: () => h.stop(),
  });
  // Startup's heartbeat finishes before the claim blocks.
  await new Promise(setImmediate);
  const pendingHeartbeat = h.tick();
  claim.resolve({ id: "new-task" });
  await started.promise;
  stale.reject(new Error("old connection failed after recovery"));
  await pendingHeartbeat;
  assert.equal(signal.aborted, false);
  finish.resolve();
  await h.done;
  assert.equal(h.completions[0].status, "completed");
  assert.equal(h.ended, true);
});

test("a delayed previous-task heartbeat failure cannot interrupt its successor", async () => {
  const stale = deferred(),
    firstStarted = deferred(),
    finishFirst = deferred();
  const secondStarted = deferred(),
    finishSecond = deferred();
  let secondSignal;
  const h = worker({
    claim: (count) => ({ id: count === 1 ? "first" : "second" }),
    heartbeat: (call) => (call === 2 ? stale.promise : {}),
    run: async (_pool, task, _id, signal) => {
      if (task.id === "first") {
        firstStarted.resolve();
        await finishFirst.promise;
      } else {
        secondSignal = signal;
        secondStarted.resolve();
        await finishSecond.promise;
      }
      return "result";
    },
    completed: (id) => {
      if (id === "second") h.stop();
    },
  });
  await firstStarted.promise;
  const pendingHeartbeat = h.tick();
  finishFirst.resolve();
  await secondStarted.promise;
  stale.reject(new Error("previous task connection failed"));
  await pendingHeartbeat;
  assert.equal(secondSignal.aborted, false);
  finishSecond.resolve();
  await h.done;
  assert.deepEqual(
    h.completions.map((task) => task.status),
    ["completed", "completed"],
  );
});

test("current heartbeat failure aborts the owned task and never replays it", async () => {
  const started = deferred();
  let calls = 0;
  const h = worker({
    claim: () => ({ id: "affected" }),
    heartbeat: (call) =>
      call === 2 ? Promise.reject(new Error("database down")) : {},
    run: async (_pool, _task, _id, signal) => {
      calls++;
      started.resolve();
      await new Promise((resolve) =>
        signal.addEventListener("abort", resolve, { once: true }),
      );
      signal.throwIfAborted();
    },
    completed: () => h.stop(),
  });
  await started.promise;
  await h.tick();
  await h.done;
  assert.equal(calls, 1);
  assert.equal(h.completions[0].status, "failed");
  assert.match(h.completions[0].error, /Database connection lost/);
  assert.equal(h.returned.length, 0);
});

for (const cancelled of [false, true]) {
  test(`SIGTERM during claim starts no provider work and ${cancelled ? "preserves cancellation" : "returns unexecuted work"}`, async () => {
    const claim = deferred();
    let calls = 0;
    const h = worker({
      cancelled,
      claim: () => claim.promise,
      run: async () => {
        calls++;
      },
    });
    await new Promise(setImmediate);
    h.stop();
    claim.resolve({ id: "not-executed" });
    await h.done;
    assert.equal(calls, 0);
    assert.deepEqual(h.returned, ["not-executed"]);
    assert.equal(h.events[0].type, cancelled ? "cancelled" : "queued");
    assert.equal(h.completions.length, 0);
  });
}

test("fresh lease validation prevents execution after claim health is lost", async () => {
  let calls = 0;
  const h = worker({
    claim: () => ({ id: "lost-lease" }),
    renew: () => ({ rowCount: 0, rows: [] }),
    run: async () => {
      calls++;
    },
    completed: () => h.stop(),
  });
  await h.done;
  assert.equal(calls, 0);
  assert.equal(h.completions[0].status, "failed");
  assert.match(h.completions[0].error, /lease was lost/);
});

test("SIGTERM during fresh lease validation starts no provider work", async () => {
  const renewal = deferred(),
    renewing = deferred();
  let calls = 0;
  const h = worker({
    claim: () => ({ id: "shutdown-before-run" }),
    renew: () => {
      renewing.resolve();
      return renewal.promise;
    },
    run: async () => {
      calls++;
    },
  });
  await renewing.promise;
  h.stop();
  renewal.resolve({ rowCount: 1, rows: [{ cancel_requested: false }] });
  await h.done;
  assert.equal(calls, 0);
  assert.equal(h.completions[0].status, "failed");
  assert.match(h.completions[0].error, /Worker stopped/);
});

test("SIGTERM interrupts already started work without returning it for automatic replay", async () => {
  const started = deferred();
  let calls = 0;
  const h = worker({
    claim: () => ({ id: "partially-executed" }),
    run: async (_pool, _task, _id, signal) => {
      calls++;
      started.resolve();
      await new Promise((resolve) =>
        signal.addEventListener("abort", resolve, { once: true }),
      );
      signal.throwIfAborted();
    },
  });
  await started.promise;
  h.stop();
  await h.done;
  assert.equal(calls, 1);
  assert.equal(h.completions[0].status, "failed");
  assert.match(h.completions[0].error, /review the partial trace/);
  assert.equal(h.returned.length, 0);
});
