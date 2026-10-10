import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createPool, transaction, event } from "./lib/db.js";
import { VERSION, integer, providerURL } from "./lib/config.js";
import { claim } from "./lib/jobs.js";
import { runTask, closeRunner } from "./lib/runner.js";
const pool = createPool(),
  id = randomUUID();
const maxSeconds = integer(process.env.MAX_TASK_SECONDS, 180, 10, 1800);
const configured = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL);
if (configured) providerURL();
let stopping = false,
  active = null,
  heartbeating = false;
const name = (process.env.WORKER_NAME || "Primary worker").slice(0, 80);
function stop() {
  stopping = true;
  active?.controller.abort(
    new Error("Worker stopped; review the partial trace before retrying."),
  );
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
async function heartbeat() {
  if (heartbeating) return;
  heartbeating = true;
  try {
    await pool.query(
      `INSERT INTO workers(id,name,version,model,model_configured) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(id) DO UPDATE SET last_seen=now()`,
      [id, name, VERSION, process.env.OPENAI_MODEL || null, configured],
    );
    if (active) {
      const current = active;
      const r = await pool.query(
        `UPDATE jobs SET lease_until=now()+interval '30 seconds'
        WHERE id=$1 AND worker_id=$2 AND status='running' AND lease_until>now() RETURNING cancel_requested`,
        [current.task.id, id],
      );
      if (!r.rowCount)
        current.controller.abort(new Error("Task lease was lost"));
      else if (r.rows[0].cancel_requested)
        current.controller.abort(new Error("Cancelled by operator"));
    }
    await writeFile("/tmp/agentkit-worker-heartbeat", String(Date.now()), {
      mode: 0o600,
    });
  } catch {
    active?.controller.abort(
      new Error(
        "Database connection lost; task interrupted. Review before retrying.",
      ),
    );
  } finally {
    heartbeating = false;
  }
}
await heartbeat();
const timer = setInterval(heartbeat, 2000);
console.log(
  `Worker ${id} started; AI provider ${configured ? "configured" : "not configured"}`,
);
try {
  while (!stopping) {
    let task;
    try {
      task = await claim(pool, id);
    } catch {
      console.error("Queue unavailable; waiting to reconnect");
      await delay(3000);
      continue;
    }
    if (!task) {
      await delay(500);
      continue;
    }
    const controller = new AbortController();
    active = { task, controller };
    const timeout = setTimeout(
      () =>
        controller.abort(
          new Error(`Task time limit reached (${maxSeconds} seconds)`),
        ),
      maxSeconds * 1000,
    );
    let result = null,
      failure = null;
    try {
      result = await runTask(pool, task, id, controller.signal);
      controller.signal.throwIfAborted();
    } catch (error) {
      failure = controller.signal.aborted
        ? controller.signal.reason.message
        : error.code
          ? "A workspace service failed. Check the worker logs and connection."
          : error.message;
    }
    clearTimeout(timeout);
    try {
      await transaction(pool, async (db) => {
        const row = (
          await db.query(
            "SELECT cancel_requested FROM jobs WHERE id=$1 AND worker_id=$2 AND status='running' AND lease_until>now() FOR UPDATE",
            [task.id, id],
          )
        ).rows[0];
        if (!row) return;
        const status = row.cancel_requested
          ? "cancelled"
          : failure
            ? "failed"
            : "completed";
        await db.query(
          "UPDATE jobs SET status=$2,result=$3,error=$4,finished_at=now(),lease_until=NULL WHERE id=$1",
          [
            task.id,
            status,
            status === "completed" ? result : null,
            status === "cancelled"
              ? "Cancelled by operator; partial tool artifacts remain in the trace."
              : failure,
          ],
        );
        await event(
          db,
          task.id,
          status,
          status === "completed"
            ? "Execution completed and result saved"
            : status === "cancelled"
              ? "Execution cancelled"
              : failure,
        );
      });
    } catch {
      console.error(
        "Could not persist task completion; the lease will expire and the task will be marked interrupted",
      );
    } finally {
      active = null;
    }
  }
} finally {
  clearInterval(timer);
  while (heartbeating) await delay(20);
  await pool.query("DELETE FROM workers WHERE id=$1", [id]).catch(() => {});
  await unlink("/tmp/agentkit-worker-heartbeat").catch(() => {});
  await closeRunner();
  await pool.end();
}
