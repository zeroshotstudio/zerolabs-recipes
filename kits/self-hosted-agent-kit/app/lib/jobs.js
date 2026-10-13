import { randomUUID } from "node:crypto";
import { ApiError, hash } from "./config.js";
import { transaction, event } from "./db.js";
export const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function jobInput(body) {
  const kind = body.kind || "assistant";
  if (!["audit", "assistant"].includes(kind))
    throw new ApiError(400, "Task kind must be assistant or audit");
  const prompt =
    kind === "audit"
      ? "Verify the task queue, database and workspace document integrity."
      : body.prompt;
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 16000)
    throw new ApiError(400, "Enter a prompt of 1–16,000 characters");
  const title =
    body.title ||
    (kind === "audit" ? "Workspace system check" : prompt.slice(0, 100));
  if (typeof title !== "string" || !title.trim() || title.length > 120)
    throw new ApiError(400, "Title must contain 1–120 characters");
  return { kind, prompt: prompt.trim(), title: title.trim() };
}
export async function enqueue(pool, input, key, actor, parent = null) {
  if (key && (typeof key !== "string" || !/^[\w.:-]{8,128}$/.test(key)))
    throw new ApiError(
      400,
      "Idempotency-Key must be 8–128 letters, digits or . : - _",
    );
  const fingerprint = hash(JSON.stringify({ ...input, parent }));
  return transaction(pool, async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(82941003)");
    if (key) {
      const prior = (
        await db.query("SELECT * FROM jobs WHERE idempotency_key=$1", [key])
      ).rows[0];
      if (prior) {
        if (prior.request_hash !== fingerprint)
          throw new ApiError(
            409,
            "Idempotency key already belongs to different task input",
          );
        return { task: prior, duplicate: true };
      }
    }
    const count = await db.query(
      "SELECT count(*) FROM jobs WHERE status IN ('queued','running')",
    );
    if (Number(count.rows[0].count) >= 100)
      throw new ApiError(
        429,
        "Queue is full (100 unfinished tasks). Try again later.",
      );
    const id = randomUUID();
    const { rows } = await db.query(
      `INSERT INTO jobs(id,title,prompt,kind,status,parent_job_id,idempotency_key,request_hash)
      VALUES($1,$2,$3,$4,'queued',$5,$6,$7) RETURNING *`,
      [
        id,
        input.title,
        input.prompt,
        input.kind,
        parent,
        key || null,
        fingerprint,
      ],
    );
    await event(db, id, "queued", "Task saved to the durable queue");
    await db.query(
      "INSERT INTO audit_log(actor,action,target) VALUES($1,'task.create',$2)",
      [actor, id],
    );
    return { task: rows[0], duplicate: false };
  });
}
async function expireLeases(db) {
  const expired =
    await db.query(`UPDATE jobs SET status=CASE WHEN cancel_requested THEN 'cancelled' ELSE 'failed' END,
      error='Worker stopped responding. Execution may have been interrupted; review before retrying.', finished_at=now(), lease_until=NULL
      WHERE status='running' AND lease_until<now() RETURNING id`);
  for (const row of expired.rows)
    await event(
      db,
      row.id,
      "interrupted",
      "Worker lease expired. Automatic retry is disabled to avoid repeating effects.",
    );
}
export async function reapExpired(pool) {
  return transaction(pool, expireLeases);
}
export async function claim(pool, workerId) {
  return transaction(pool, async (db) => {
    await expireLeases(db);
    const { rows } = await db.query(
      "SELECT id FROM jobs WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
    );
    if (!rows.length) return null;
    const task = (
      await db.query(
        `UPDATE jobs SET status='running',worker_id=$2,started_at=now(),lease_until=now()+interval '30 seconds'
      WHERE id=$1 RETURNING *`,
        [rows[0].id, workerId],
      )
    ).rows[0];
    await event(db, task.id, "started", "Worker started execution");
    return task;
  });
}
export async function cancel(pool, id, actor) {
  return transaction(pool, async (db) => {
    const task = (
      await db.query("SELECT status FROM jobs WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!task) throw new ApiError(404, "Task not found");
    if (!["queued", "running"].includes(task.status))
      throw new ApiError(409, "This task has already finished");
    await db.query(
      `UPDATE jobs SET cancel_requested=true,
      status=CASE WHEN status='queued' THEN 'cancelled' ELSE status END,
      finished_at=CASE WHEN status='queued' THEN now() ELSE finished_at END WHERE id=$1`,
      [id],
    );
    await event(
      db,
      id,
      "cancel_requested",
      "Cancellation requested by operator",
    );
    await db.query(
      "INSERT INTO audit_log(actor,action,target) VALUES($1,'task.cancel',$2)",
      [actor, id],
    );
  });
}
