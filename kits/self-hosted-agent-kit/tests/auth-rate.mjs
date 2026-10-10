import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const env = Object.fromEntries(
  (await readFile(new URL("../.env", import.meta.url), "utf8"))
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
assert.match(env.COMPOSE_PROJECT_NAME, /test/);
// Run after browser journeys: this intentionally rate-limits this test client's IP for one minute.
let denied = false;
for (let i = 0; i < 12; i++) {
  const r = await fetch(env.PUBLIC_ORIGIN + "/api/auth/login", {
    method: "POST",
    headers: {
      origin: env.PUBLIC_ORIGIN,
      "content-type": "application/json",
      "x-agentkit-client-ip": `203.0.113.${i + 1}`,
    },
    body: JSON.stringify({ key: "intentionally-wrong-key" }),
    signal: AbortSignal.timeout(15000),
  });
  assert.ok([401, 429].includes(r.status));
  if (r.status === 429) denied = true;
}
assert.ok(
  denied,
  "Spoofed client-IP headers must not bypass the login rate limit",
);
console.log(
  "PASS login attempts are rate-limited and Caddy overwrites spoofed client-IP headers",
);
