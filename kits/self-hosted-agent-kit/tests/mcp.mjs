import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Client } from "../integrations/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "../integrations/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";
const root = new URL("..", import.meta.url).pathname;
const env = Object.fromEntries(
  (await readFile(root + ".env", "utf8"))
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
assert.match(env.COMPOSE_PROJECT_NAME, /test/);
const r = await fetch(env.PUBLIC_ORIGIN + "/api/tokens", {
  method: "POST",
  headers: {
    authorization: `Bearer ${env.ADMIN_TOKEN}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    name: "MCP acceptance",
    scopes: ["tasks:read", "tasks:write", "documents:read"],
  }),
});
assert.equal(r.status, 201);
const token = await r.json();
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [root + "integrations/mcp/index.js"],
  env: {
    ...process.env,
    AGENTKIT_URL: env.PUBLIC_ORIGIN,
    AGENTKIT_TOKEN: token.token,
    NO_PROXY: "localhost,127.0.0.1",
    no_proxy: "localhost,127.0.0.1",
  },
});
const client = new Client({ name: "agentkit-acceptance", version: "1.0.0" });
try {
  await client.connect(transport);
  const listed = await client.listTools();
  assert.equal(listed.tools.length, 5);
  const submitted = await client.callTool({
    name: "submit_task",
    arguments: { kind: "audit", idempotency_key: crypto.randomUUID() },
  });
  assert.ok(!submitted.isError);
  const id = JSON.parse(submitted.content[0].text).task.id;
  const result = await client.callTool({ name: "get_task", arguments: { id } });
  assert.equal(JSON.parse(result.content[0].text).task.id, id);
  const docs = await client.callTool({ name: "list_documents", arguments: {} });
  assert.ok(Array.isArray(JSON.parse(docs.content[0].text).documents));
  const invalid = await client.callTool({
    name: "get_task",
    arguments: { id: "../../secret" },
  });
  assert.equal(invalid.isError, true);
  console.log(
    "PASS MCP initialize, tool discovery, submission, task lookup, documents and invalid argument rejection",
  );
} finally {
  await client.close();
  await fetch(env.PUBLIC_ORIGIN + "/api/tokens/" + token.id, {
    method: "DELETE",
    headers: { authorization: `Bearer ${env.ADMIN_TOKEN}` },
  });
}
