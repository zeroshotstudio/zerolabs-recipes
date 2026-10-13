import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("desktop MCP server initializes and serves tools, resources, and prompts", { timeout: 10000 }, async () => {
  const client = new Client({ name: "offline-smoke-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/server.js"],
    env: { MCP_DEBUG: "true", API_SECRET_KEY: "test-secret" },
  });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ["ping", "verify_environment"]);
    const ping = await client.callTool({ name: "ping", arguments: { message: "stdio works" } });
    assert.equal(ping.isError, undefined);
    assert.equal(JSON.parse(ping.content[0].text).echo, "stdio works");
    const environment = await client.callTool({ name: "verify_environment", arguments: {} });
    const status = JSON.parse(environment.content[0].text);
    assert.equal(status.mcp_debug, "true");
    assert.equal(status.secret_present, true);
    assert.equal(status.secret_length, 11);
    assert.equal(status.secret, undefined);
    const invalid = await client.callTool({ name: "ping", arguments: { message: 42 } });
    assert.equal(invalid.isError, true);
    const telemetry = await client.readResource({ uri: "system://telemetry" });
    assert.equal(JSON.parse(telemetry.contents[0].text).nodeVersion, process.version);
    const prompt = await client.getPrompt({
      name: "client-diagnostics",
      arguments: { clientName: "Cursor", errorMessage: "test error" },
    });
    assert.match(prompt.messages[0].content.text, /Cursor/);
    assert.match(prompt.messages[0].content.text, /test error/);
  } finally {
    await client.close();
    await transport.close();
  }
});
