import pg from "pg";
import { required } from "./config.js";
export function createPool(admin = false) {
  const pool = new pg.Pool({
    host: process.env.DB_HOST || "postgres",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || "agentkit",
    user: admin ? "agent_admin" : "agent_app",
    password: required(admin ? "POSTGRES_ADMIN_PASSWORD" : "DB_PASSWORD", 24),
    max: 8,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 10000,
    application_name: admin ? "agentkit-migration" : "agentkit-runtime",
  });
  pool.on("error", () =>
    console.error("Database connection lost; retrying on next operation"),
  );
  return pool;
}
export async function transaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
export async function event(db, jobId, type, message, data = {}) {
  await db.query(
    "INSERT INTO task_events(job_id,type,message,data) VALUES($1,$2,$3,$4)",
    [jobId, type, message, data],
  );
}
