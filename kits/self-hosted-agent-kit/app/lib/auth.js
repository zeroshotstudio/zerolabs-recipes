import { randomBytes, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { ApiError, equal, hash } from "./config.js";
export const SCOPES = ["tasks:read", "tasks:write", "documents:read"];
const mutations = new Set(["POST", "PUT", "PATCH", "DELETE"]);
export function authService(pool, adminKey, origin) {
  const attempts = new Map();
  const secure = origin.startsWith("https:") ? "; Secure" : "";
  const cookie = (token, age) =>
    `agentkit_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure}`;
  function checkOrigin(req) {
    if (req.headers.origin !== origin)
      throw new ApiError(403, "Request origin does not match PUBLIC_ORIGIN");
  }
  return {
    async login(req, body) {
      checkOrigin(req);
      const forwarded = req.headers["x-agentkit-client-ip"];
      const ip =
        process.env.TRUST_PROXY === "true" &&
        typeof forwarded === "string" &&
        isIP(forwarded)
          ? forwarded
          : req.socket.remoteAddress;
      const now = Date.now();
      for (const [key, value] of attempts)
        if (value.until < now) attempts.delete(key);
      if (!attempts.has(ip) && attempts.size >= 10000)
        throw new ApiError(429, "Login service is busy. Try again shortly.");
      const attempt = attempts.get(ip) || { count: 0, until: now + 60000 };
      attempt.count++;
      attempts.set(ip, attempt);
      if (attempt.count > 10)
        throw new ApiError(429, "Too many attempts. Try again in one minute.");
      if (typeof body.key !== "string" || !equal(body.key, adminKey))
        throw new ApiError(401, "Access key is incorrect");
      attempts.delete(ip);
      const token = randomBytes(32).toString("hex"),
        csrf = randomBytes(24).toString("hex");
      await pool.query("DELETE FROM sessions WHERE expires_at < now()");
      await pool.query(
        "INSERT INTO sessions(token_hash,csrf,expires_at) VALUES($1,$2,now()+interval '8 hours')",
        [hash(token), csrf],
      );
      await pool.query(
        "INSERT INTO audit_log(actor,action) VALUES('operator','login')",
      );
      return { cookie: cookie(token, 28800), csrf };
    },
    async identify(req) {
      if (req.headers.authorization?.startsWith("Bearer ")) {
        const value = req.headers.authorization.slice(7);
        if (value.length > 512) throw new ApiError(401, "Invalid token");
        if (equal(value, adminKey))
          return { admin: true, actor: "operator-api" };
        const { rows } = await pool.query(
          "UPDATE api_tokens SET last_used_at=now() WHERE token_hash=$1 RETURNING id,scopes",
          [hash(value)],
        );
        if (!rows.length) throw new ApiError(401, "Invalid or revoked token");
        return { admin: false, scopes: rows[0].scopes, actor: rows[0].id };
      }
      const token = (req.headers.cookie || "")
        .split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("agentkit_session="))
        ?.slice("agentkit_session=".length);
      if (!token || !/^[a-f0-9]{64}$/.test(token))
        throw new ApiError(401, "Sign in to continue");
      const { rows } = await pool.query(
        "SELECT csrf FROM sessions WHERE token_hash=$1 AND expires_at>now()",
        [hash(token)],
      );
      if (!rows.length)
        throw new ApiError(401, "Session expired. Sign in again.");
      if (mutations.has(req.method)) {
        checkOrigin(req);
        if (!equal(String(req.headers["x-csrf-token"] || ""), rows[0].csrf))
          throw new ApiError(403, "Invalid CSRF token. Reload and try again.");
      }
      return {
        admin: true,
        actor: "operator",
        csrf: rows[0].csrf,
        sessionHash: hash(token),
      };
    },
    async logout(identity) {
      if (identity.sessionHash)
        await pool.query("DELETE FROM sessions WHERE token_hash=$1", [
          identity.sessionHash,
        ]);
      return cookie("", 0);
    },
    async issue(name, scopes) {
      if (typeof name !== "string" || !name.trim() || name.length > 80)
        throw new ApiError(400, "Enter a token name of 1–80 characters");
      if (
        !Array.isArray(scopes) ||
        !scopes.length ||
        scopes.some((s) => !SCOPES.includes(s))
      )
        throw new ApiError(400, "Choose valid token scopes");
      const count = await pool.query("SELECT count(*) FROM api_tokens");
      if (Number(count.rows[0].count) >= 50)
        throw new ApiError(409, "Revoke an unused token first (limit 50)");
      const token = "ak_" + randomBytes(32).toString("hex"),
        id = randomUUID();
      await pool.query(
        "INSERT INTO api_tokens(id,name,token_hash,scopes) VALUES($1,$2,$3,$4)",
        [id, name.trim(), hash(token), [...new Set(scopes)]],
      );
      return { id, token, name: name.trim(), scopes };
    },
  };
}
export function requireScope(identity, scope) {
  if (!identity.admin && !identity.scopes?.includes(scope))
    throw new ApiError(403, "This token does not have the required permission");
}
export function requireAdmin(identity) {
  if (!identity.admin) throw new ApiError(403, "Operator access is required");
}
