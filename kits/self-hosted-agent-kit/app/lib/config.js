import { createHash, timingSafeEqual } from "node:crypto";
export const VERSION = "2.0.0";
export function integer(value, fallback, min, max) {
  const n = Number(value ?? fallback);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error(`Expected an integer between ${min} and ${max}`);
  return n;
}
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const equal = (a, b) =>
  timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
export function required(name, min = 1) {
  const value = process.env[name] || "";
  if (value.length < min || /CHANGEME|REPLACE_ME/i.test(value))
    throw new Error(`${name} must be configured (${min}+ characters)`);
  return value;
}
export function publicOrigin() {
  const u = new URL(process.env.PUBLIC_ORIGIN || "http://localhost:3080");
  if (u.pathname !== "/" || u.username || u.password || u.search || u.hash)
    throw new Error("PUBLIC_ORIGIN must be an origin without a path");
  if (
    u.protocol !== "https:" &&
    !(
      u.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
    )
  )
    throw new Error("PUBLIC_ORIGIN must use HTTPS, except on loopback");
  return u.origin;
}
export function providerURL() {
  const u = new URL(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1");
  if (u.username || u.password || u.search || u.hash)
    throw new Error("Invalid OPENAI_BASE_URL");
  if (
    u.protocol !== "https:" &&
    !(
      u.protocol === "http:" &&
      process.env.ALLOW_INSECURE_MODEL_ENDPOINT === "true"
    )
  )
    throw new Error("Model endpoint must use HTTPS");
  return u.href.replace(/\/$/, "") + "/responses";
}
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
