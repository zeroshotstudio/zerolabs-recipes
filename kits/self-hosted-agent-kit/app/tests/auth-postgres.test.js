import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { authService } from "../lib/auth.js";
import { hash } from "../lib/config.js";

test(
  "PostgreSQL serializes token issuance and rolls back a failed creation audit",
  {
    skip:
      !process.env.AUTH_TEST_DATABASE_URL &&
      "Set AUTH_TEST_DATABASE_URL to an isolated PostgreSQL database",
  },
  async () => {
    const schema = "auth_test_" + randomBytes(8).toString("hex");
    const admin = new pg.Pool({
      connectionString: process.env.AUTH_TEST_DATABASE_URL,
    });
    let pool;
    try {
      await admin.query(`CREATE SCHEMA ${schema}`);
      pool = new pg.Pool({
        connectionString: process.env.AUTH_TEST_DATABASE_URL,
        options: `-c search_path=${schema}`,
        max: 16,
      });
      await pool.query(`
      CREATE TABLE api_tokens(id uuid PRIMARY KEY, name text NOT NULL,
        token_hash text UNIQUE NOT NULL, scopes text[] NOT NULL);
      CREATE TABLE audit_log(id bigserial PRIMARY KEY, actor text NOT NULL,
        action text NOT NULL, target text);
      CREATE FUNCTION slow_token_insert() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN PERFORM pg_sleep(0.1); RETURN NEW; END
      $$;
      CREATE TRIGGER slow_insert BEFORE INSERT ON api_tokens
        FOR EACH ROW EXECUTE FUNCTION slow_token_insert();
      CREATE FUNCTION reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.actor = 'reject-audit' THEN RAISE EXCEPTION 'test audit failure'; END IF;
          RETURN NEW;
        END
      $$;
      CREATE TRIGGER reject_audit BEFORE INSERT ON audit_log
        FOR EACH ROW EXECUTE FUNCTION reject_test_audit();
    `);
      const initial = Array.from({ length: 49 }, () => randomUUID());
      // Seed in one statement, bypassing the deliberate INSERT delay.
      await pool.query("ALTER TABLE api_tokens DISABLE TRIGGER slow_insert");
      await pool.query(
        "INSERT INTO api_tokens(id,name,token_hash,scopes) SELECT id,'existing',id::text,ARRAY['tasks:read'] FROM unnest($1::uuid[]) AS id",
        [initial],
      );
      await pool.query("ALTER TABLE api_tokens ENABLE TRIGGER slow_insert");
      const auth = authService(pool, "unused-test-key", "http://localhost");
      const attempts = await Promise.allSettled(
        Array.from({ length: 8 }, (_, index) =>
          auth.issue(
            `Concurrent ${index}`,
            ["tasks:read", "tasks:read"],
            "test-operator",
          ),
        ),
      );
      const accepted = attempts.filter((item) => item.status === "fulfilled");
      const refused = attempts.filter((item) => item.status === "rejected");
      assert.equal(accepted.length, 1);
      assert.equal(refused.length, 7);
      for (const item of refused) assert.equal(item.reason.status, 409);
      assert.equal(
        Number(
          (await pool.query("SELECT count(*) FROM api_tokens")).rows[0].count,
        ),
        50,
      );
      const created = accepted[0].value;
      assert.deepEqual(created.scopes, ["tasks:read"]);
      assert.deepEqual(
        (await pool.query("SELECT actor,action,target FROM audit_log")).rows,
        [
          {
            actor: "test-operator",
            action: "token.create",
            target: created.id,
          },
        ],
      );
      assert.equal(
        (
          await pool.query("SELECT token_hash FROM api_tokens WHERE id=$1", [
            created.id,
          ])
        ).rows[0].token_hash,
        hash(created.token),
      );

      await pool.query("DELETE FROM api_tokens WHERE id=$1", [initial[0]]);
      await assert.rejects(
        auth.issue("Must roll back", ["tasks:write"], "reject-audit"),
        /test audit failure/,
      );
      assert.equal(
        Number(
          (await pool.query("SELECT count(*) FROM api_tokens")).rows[0].count,
        ),
        49,
      );
      assert.equal(
        Number(
          (await pool.query("SELECT count(*) FROM audit_log")).rows[0].count,
        ),
        1,
      );
      // A rejected transaction releases the lock and leaves room for a later issuer.
      const recovered = await auth.issue(
        "After rollback",
        ["tasks:write"],
        "test-operator",
      );
      assert.equal(
        Number(
          (await pool.query("SELECT count(*) FROM api_tokens")).rows[0].count,
        ),
        50,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT target FROM audit_log ORDER BY id DESC LIMIT 1",
          )
        ).rows[0].target,
        recovered.id,
      );
    } finally {
      await pool?.end();
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  },
);
