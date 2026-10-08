import { createPool, transaction } from "./lib/db.js";
import { required, VERSION } from "./lib/config.js";
const pool = createPool(true);
try {
  await transaction(pool, async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(82941002)");
    const password = required("DB_PASSWORD", 24);
    const exists = await db.query(
      "SELECT 1 FROM pg_roles WHERE rolname='agent_app'",
    );
    const quoted = (
      await db.query("SELECT quote_literal($1) AS password", [password])
    ).rows[0].password;
    await db.query(
      `${exists.rowCount ? "ALTER" : "CREATE"} ROLE agent_app LOGIN PASSWORD ${quoted} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`,
    );
    await db.query(`
      REVOKE CREATE ON SCHEMA public FROM PUBLIC;
      CREATE TABLE IF NOT EXISTS schema_version(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS jobs(
        id uuid PRIMARY KEY, title text NOT NULL, prompt text NOT NULL,
        kind text NOT NULL CHECK(kind IN ('assistant','audit','legacy')),
        status text NOT NULL CHECK(status IN ('queued','running','completed','failed','cancelled','archived')),
        created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, finished_at timestamptz,
        worker_id uuid, lease_until timestamptz, cancel_requested boolean NOT NULL DEFAULT false,
        result text, error text, model text, input_tokens bigint, output_tokens bigint,
        parent_job_id uuid REFERENCES jobs(id), idempotency_key text UNIQUE, request_hash text,
        imported_from text UNIQUE
      );
      CREATE INDEX IF NOT EXISTS jobs_queue ON jobs(created_at) WHERE status='queued';
      CREATE INDEX IF NOT EXISTS jobs_created ON jobs(created_at DESC);
      CREATE TABLE IF NOT EXISTS task_events(
        id bigserial PRIMARY KEY, job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        type text NOT NULL, message text NOT NULL, data jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS events_job ON task_events(job_id,id);
      CREATE TABLE IF NOT EXISTS documents(id uuid PRIMARY KEY, title text NOT NULL, content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS artifacts(id uuid PRIMARY KEY, job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        name text NOT NULL, content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS workers(id uuid PRIMARY KEY, name text NOT NULL, version text NOT NULL, model text,
        model_configured boolean NOT NULL, last_seen timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS sessions(token_hash text PRIMARY KEY, csrf text NOT NULL, expires_at timestamptz NOT NULL);
      CREATE TABLE IF NOT EXISTS api_tokens(id uuid PRIMARY KEY, name text NOT NULL, token_hash text UNIQUE NOT NULL,
        scopes text[] NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), last_used_at timestamptz);
      CREATE TABLE IF NOT EXISTS audit_log(id bigserial PRIMARY KEY, actor text NOT NULL, action text NOT NULL, target text, created_at timestamptz NOT NULL DEFAULT now());
      GRANT USAGE ON SCHEMA public TO agent_app;
      GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO agent_app;
      GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO agent_app;
      REVOKE ALL ON schema_version FROM agent_app;
      GRANT SELECT ON schema_version TO agent_app;
    `);
    const legacy = await db.query(
      "SELECT to_regclass('public.agent_tasks') AS name",
    );
    if (legacy.rows[0].name) {
      await db.query(`INSERT INTO jobs(id,title,prompt,kind,status,result,imported_from)
        SELECT gen_random_uuid(),'Imported v1 record','Legacy record; execution was not verified.','legacy','archived',
        to_jsonb(t)::text,'agent_tasks:' || md5(to_jsonb(t)::text) FROM agent_tasks t ON CONFLICT(imported_from) DO NOTHING`);
    }
    await db.query(
      "INSERT INTO schema_version(version) VALUES($1) ON CONFLICT DO NOTHING",
      [VERSION],
    );
  });
  console.log(`Schema ${VERSION} ready`);
} catch (error) {
  console.error(
    "Migration failed:",
    error.message.replace(/password\s+.*/i, "password [redacted]"),
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
