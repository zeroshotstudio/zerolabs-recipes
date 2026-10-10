import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createPool, transaction } from "./lib/db.js";
import { ApiError, VERSION, required, publicOrigin } from "./lib/config.js";
import { authService, requireAdmin, requireScope } from "./lib/auth.js";
import { UUID, jobInput, enqueue, cancel, reapExpired } from "./lib/jobs.js";
const pool = createPool(),
  origin = publicOrigin();
const auth = authService(pool, required("ADMIN_TOKEN", 32), origin);
const root = fileURLToPath(new URL("./public/", import.meta.url));
const assets = new Map([
  ["/", ["index.html", "text/html"]],
  ["/app.js", ["app.js", "text/javascript"]],
  ["/style.css", ["style.css", "text/css"]],
  ["/docs", ["docs.html", "text/html"]],
  ["/favicon.svg", ["favicon.svg", "image/svg+xml"]],
]);
const security = {
  "content-security-policy":
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "cache-control": "no-store",
  ...(origin.startsWith("https:")
    ? { "strict-transport-security": "max-age=31536000" }
    : {}),
};
function send(res, status, data, headers = {}) {
  if (res.writableEnded) return;
  res.writeHead(status, {
    ...security,
    "content-type": "application/json; charset=utf-8",
    ...headers,
  });
  res.end(
    typeof data === "string" || Buffer.isBuffer(data)
      ? data
      : JSON.stringify(data),
  );
}
async function body(req) {
  if (!(req.headers["content-type"] || "").startsWith("application/json"))
    throw new ApiError(415, "Use Content-Type: application/json");
  const parts = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 196608)
      throw new ApiError(413, "Request is too large (192 KiB maximum)");
    parts.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(parts).toString());
    if (!value || Array.isArray(value) || typeof value !== "object")
      throw new Error();
    return value;
  } catch {
    throw new ApiError(400, "Body must be a JSON object");
  }
}
function submission(result) {
  const { id, title, kind, status, created_at, parent_job_id } = result.task;
  // Replaying a submission must not expose saved results to a write-only token.
  return {
    task: { id, title, kind, status, created_at, parent_job_id },
    duplicate: result.duplicate,
  };
}
async function workers() {
  return (
    await pool.query(
      "SELECT *,last_seen>now()-interval '15 seconds' AS online FROM workers WHERE last_seen>now()-interval '24 hours' ORDER BY last_seen DESC",
    )
  ).rows;
}
async function recovery() {
  try {
    const record = JSON.parse(
      await readFile(
        process.env.BACKUP_STATUS_FILE || "/state/backup-status.json",
        "utf8",
      ),
    );
    const age = Date.now() - Date.parse(record.verified_at);
    return {
      ...record,
      status:
        record.status === "failed"
          ? "failed"
          : Number.isFinite(age) && age >= 0 && age < 36 * 3600000
            ? "verified"
            : "stale",
    };
  } catch {
    return {
      status: "unknown",
      message:
        "No verified backup recorded. Run scripts/backup.sh or enable the backup timer.",
    };
  }
}
const server = http.createServer(async (req, res) => {
  const requestId = randomUUID();
  try {
    const url = new URL(req.url, origin),
      path = url.pathname;
    if (req.method === "GET" && path === "/health/live")
      return send(res, 200, { status: "alive", version: VERSION });
    if (req.method === "GET" && path === "/health/ready") {
      await pool.query("SELECT 1");
      const ready = (await workers()).some((w) => w.online);
      return send(res, ready ? 200 : 503, {
        status: ready ? "ready" : "degraded",
        database: "ready",
        worker: ready ? "online" : "offline",
      });
    }
    if (req.method === "GET" && assets.has(path)) {
      const [file, type] = assets.get(path);
      return send(res, 200, await readFile(root + file), {
        "content-type": type + "; charset=utf-8",
      });
    }
    if (req.method === "POST" && path === "/api/auth/login") {
      const session = await auth.login(req, await body(req));
      return send(
        res,
        200,
        { csrf: session.csrf, admin: true, version: VERSION, origin },
        { "set-cookie": session.cookie },
      );
    }
    if (!path.startsWith("/api/")) throw new ApiError(404, "Not found");
    const identity = await auth.identify(req);
    if (req.method === "GET" && path === "/api/auth/session")
      return send(res, 200, {
        admin: identity.admin,
        csrf: identity.csrf || null,
        version: VERSION,
        origin,
      });
    if (req.method === "POST" && path === "/api/auth/logout")
      return send(
        res,
        200,
        { ok: true },
        { "set-cookie": await auth.logout(identity) },
      );
    if (req.method === "GET" && path === "/api/overview") {
      requireScope(identity, "tasks:read");
      const [counts, recent, ws, backup, docs] = await Promise.all([
        pool.query(
          "SELECT status,count(*)::int AS count FROM jobs GROUP BY status",
        ),
        pool.query(
          "SELECT id,title,kind,status,created_at,finished_at FROM jobs ORDER BY created_at DESC LIMIT 8",
        ),
        workers(),
        recovery(),
        pool.query("SELECT count(*)::int AS count FROM documents"),
      ]);
      return send(res, 200, {
        counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.count])),
        recent: recent.rows,
        workers: ws,
        backup,
        documents: docs.rows[0].count,
        measured_at: new Date().toISOString(),
      });
    }
    if (path === "/api/tasks" && req.method === "POST") {
      requireScope(identity, "tasks:write");
      const input = jobInput(await body(req));
      const result = await enqueue(
        pool,
        input,
        req.headers["idempotency-key"],
        identity.actor,
      );
      return send(res, result.duplicate ? 200 : 202, submission(result));
    }
    if (path === "/api/tasks" && req.method === "GET") {
      requireScope(identity, "tasks:read");
      const status = url.searchParams.get("status") || "",
        q = (url.searchParams.get("q") || "").slice(0, 120);
      if (
        status &&
        ![
          "queued",
          "running",
          "completed",
          "failed",
          "cancelled",
          "archived",
        ].includes(status)
      )
        throw new ApiError(400, "Invalid status");
      const offset = Math.min(
        1000000,
        Math.max(0, Number.parseInt(url.searchParams.get("offset"), 10) || 0),
      );
      const values = [status, `%${q.replace(/[\\%_]/g, "\\$&")}%`, offset];
      const where = "($1='' OR status=$1) AND title ILIKE $2";
      const rows = (
        await pool.query(
          `SELECT id,title,kind,status,created_at,started_at,finished_at,model,input_tokens,output_tokens,cancel_requested FROM jobs WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT 30 OFFSET $3`,
          values,
        )
      ).rows;
      const total = (
        await pool.query(
          `SELECT count(*)::int AS total FROM jobs WHERE ${where}`,
          values.slice(0, 2),
        )
      ).rows[0].total;
      return send(res, 200, { tasks: rows, total, offset, limit: 30 });
    }
    const match = path.match(
      /^\/api\/tasks\/([^/]+)(?:\/(events|cancel|retry))?$/,
    );
    if (match) {
      const [, id, action] = match;
      if (!UUID.test(id)) throw new ApiError(400, "Invalid task ID");
      requireScope(
        identity,
        req.method === "GET" ? "tasks:read" : "tasks:write",
      );
      const task = (await pool.query("SELECT * FROM jobs WHERE id=$1", [id]))
        .rows[0];
      if (!task) throw new ApiError(404, "Task not found");
      if (!action && req.method === "GET") {
        const artifacts = (
          await pool.query(
            "SELECT id,name,length(content) AS characters,created_at FROM artifacts WHERE job_id=$1 ORDER BY created_at",
            [id],
          )
        ).rows;
        return send(res, 200, { task, artifacts });
      }
      if (action === "events" && req.method === "GET") {
        const after = url.searchParams.get("after") || "0";
        if (!/^\d{1,16}$/.test(after))
          throw new ApiError(400, "Invalid event cursor");
        return send(res, 200, {
          events: (
            await pool.query(
              "SELECT * FROM task_events WHERE job_id=$1 AND id>$2 ORDER BY id LIMIT 250",
              [id, after],
            )
          ).rows,
        });
      }
      if (action === "cancel" && req.method === "POST") {
        await cancel(pool, id, identity.actor);
        return send(res, 202, { ok: true });
      }
      if (action === "retry" && req.method === "POST") {
        if (!["failed", "cancelled"].includes(task.status))
          throw new ApiError(
            409,
            "Only failed or cancelled tasks can be retried",
          );
        const result = await enqueue(
          pool,
          jobInput(task),
          req.headers["idempotency-key"],
          identity.actor,
          id,
        );
        return send(res, result.duplicate ? 200 : 202, submission(result));
      }
    }
    const artifact = path.match(/^\/api\/artifacts\/([^/]+)$/);
    if (artifact && req.method === "GET") {
      requireScope(identity, "tasks:read");
      if (!UUID.test(artifact[1]))
        throw new ApiError(400, "Invalid artifact ID");
      const data = (
        await pool.query("SELECT content FROM artifacts WHERE id=$1", [
          artifact[1],
        ])
      ).rows[0];
      if (!data) throw new ApiError(404, "Artifact not found");
      return send(res, 200, data.content, {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="artifact-${artifact[1]}.txt"`,
      });
    }
    if (path === "/api/documents" && req.method === "GET") {
      requireScope(identity, "documents:read");
      return send(res, 200, {
        documents: (
          await pool.query(
            "SELECT id,title,octet_length(content) AS bytes,created_at FROM documents ORDER BY created_at DESC",
          )
        ).rows,
      });
    }
    if (path === "/api/documents" && req.method === "POST") {
      requireAdmin(identity);
      const data = await body(req);
      if (
        typeof data.title !== "string" ||
        !data.title.trim() ||
        data.title.length > 120 ||
        typeof data.content !== "string" ||
        !data.content.trim() ||
        Buffer.byteLength(data.content) > 65536
      )
        throw new ApiError(
          400,
          "Use a title (1–120 characters) and text content (1–65,536 bytes)",
        );
      const id = randomUUID();
      await transaction(pool, async (db) => {
        await db.query("SELECT pg_advisory_xact_lock(82941004)");
        if (
          Number(
            (await db.query("SELECT count(*) FROM documents")).rows[0].count,
          ) >= 100
        )
          throw new ApiError(409, "Workspace limit reached (100 documents)");
        await db.query(
          "INSERT INTO documents(id,title,content) VALUES($1,$2,$3)",
          [id, data.title.trim(), data.content],
        );
        await db.query(
          "INSERT INTO audit_log(actor,action,target) VALUES($1,'document.create',$2)",
          [identity.actor, id],
        );
      });
      return send(res, 201, { id });
    }
    const document = path.match(/^\/api\/documents\/([^/]+)$/);
    if (document) {
      if (!UUID.test(document[1]))
        throw new ApiError(400, "Invalid document ID");
      if (req.method === "GET") {
        requireScope(identity, "documents:read");
        const doc = (
          await pool.query("SELECT * FROM documents WHERE id=$1", [document[1]])
        ).rows[0];
        if (!doc) throw new ApiError(404, "Document not found");
        return send(res, 200, doc);
      }
      if (req.method === "DELETE") {
        requireAdmin(identity);
        await transaction(pool, async (db) => {
          const r = await db.query("DELETE FROM documents WHERE id=$1", [
            document[1],
          ]);
          if (!r.rowCount) throw new ApiError(404, "Document not found");
          await db.query(
            "INSERT INTO audit_log(actor,action,target) VALUES($1,'document.delete',$2)",
            [identity.actor, document[1]],
          );
        });
        return send(res, 200, { ok: true });
      }
    }
    if (path === "/api/tokens") {
      requireAdmin(identity);
      if (req.method === "GET")
        return send(res, 200, {
          tokens: (
            await pool.query(
              "SELECT id,name,scopes,created_at,last_used_at FROM api_tokens ORDER BY created_at DESC",
            )
          ).rows,
        });
      if (req.method === "POST") {
        const data = await body(req),
          token = await auth.issue(data.name, data.scopes);
        await pool.query(
          "INSERT INTO audit_log(actor,action,target) VALUES($1,'token.create',$2)",
          [identity.actor, token.id],
        );
        return send(res, 201, token);
      }
    }
    const token = path.match(/^\/api\/tokens\/([^/]+)$/);
    if (token && req.method === "DELETE") {
      requireAdmin(identity);
      if (!UUID.test(token[1])) throw new ApiError(400, "Invalid token ID");
      await pool.query("DELETE FROM api_tokens WHERE id=$1", [token[1]]);
      await pool.query(
        "INSERT INTO audit_log(actor,action,target) VALUES($1,'token.revoke',$2)",
        [identity.actor, token[1]],
      );
      return send(res, 200, { ok: true });
    }
    if (path === "/api/recovery" && req.method === "GET") {
      requireAdmin(identity);
      return send(res, 200, await recovery());
    }
    if (path === "/api/audit" && req.method === "GET") {
      requireAdmin(identity);
      return send(res, 200, {
        entries: (
          await pool.query("SELECT * FROM audit_log ORDER BY id DESC LIMIT 50")
        ).rows,
      });
    }
    throw new ApiError(404, "Endpoint not found");
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 503;
    if (!(error instanceof ApiError))
      console.error(
        `Request ${requestId}: service unavailable (${/^[A-Z0-9_]{1,30}$/.test(error.code || "") ? error.code : "internal error"})`,
      );
    send(res, status, {
      error:
        error instanceof ApiError
          ? error.message
          : "A service is unavailable. Try again shortly.",
      request_id: requestId,
    });
  }
});
let reaping = false;
const reaper = setInterval(async () => {
  if (reaping) return;
  reaping = true;
  try {
    await reapExpired(pool);
  } catch {
    console.error("Task lease cleanup waiting for database recovery");
  } finally {
    reaping = false;
  }
}, 5000);
reaper.unref();
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;
server.maxConnections = 256;
server.listen(Number(process.env.PORT || 3000), "0.0.0.0", () =>
  console.log(`Agent Kit ${VERSION} listening`),
);
function stop() {
  clearInterval(reaper);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 12000).unref();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
