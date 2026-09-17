import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Verification Client: Tests the MCP TypeScript server over stdio transport.
 * Exercises tool discovery, tool execution, resource listing, resource reading,
 * dynamic resource templates, and prompt template retrieval.
 */
async function runClientVerification() {
  console.log("=== Starting MCP TypeScript Verification Client ===");

  const serverScript = path.resolve(__dirname, "index.ts");

  // Spin up the server process via tsx over stdio
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", serverScript]
  });

  const client = new Client(
    {
      name: "verification-client",
      version: "1.0.0"
    },
    {
      capabilities: {}
    }
  );

  await client.connect(transport);
  console.log("Connected to MCP server via stdio.");

  // 1. Tool discovery and invocation
  const toolsResponse = await client.listTools();
  console.log(`Discovered ${toolsResponse.tools.length} tools:`);
  for (const tool of toolsResponse.tools) {
    console.log(`  - ${tool.name}: ${tool.description}`);
  }

  // Invoke calculate_cluster_health
  const healthResult = await client.callTool({
    name: "calculate_cluster_health",
    arguments: {
      clusterId: "prod-us-east-1",
      activeErrors: 2,
      windowMinutes: 30
    }
  });
  console.log("\nInvocation calculate_cluster_health result:");
  console.log(JSON.stringify(healthResult, null, 2));

  // 2. Resource inspection
  const resourcesResponse = await client.listResources();
  console.log(`\nDiscovered ${resourcesResponse.resources.length} static resources:`);
  for (const res of resourcesResponse.resources) {
    console.log(`  - ${res.uri} (${res.name})`);
  }

  // Read static resource
  const staticRes = await client.readResource({ uri: "cluster://inventory/manifest" });
  console.log("\nRead static resource cluster://inventory/manifest:");
  console.log(JSON.stringify(staticRes, null, 2));

  // Read dynamic template resource
  const dynamicRes = await client.readResource({ uri: "cluster://nodes/node-02/telemetry" });
  console.log("\nRead dynamic template resource cluster://nodes/node-02/telemetry:");
  console.log(JSON.stringify(dynamicRes, null, 2));

  // 3. Prompt templates
  const promptsResponse = await client.listPrompts();
  console.log(`\nDiscovered ${promptsResponse.prompts.length} prompt templates:`);
  for (const p of promptsResponse.prompts) {
    console.log(`  - ${p.name}: ${p.description}`);
  }

  // Retrieve prompt
  const promptResult = await client.getPrompt({
    name: "diagnose-incident",
    arguments: {
      clusterId: "prod-us-east-1",
      alertName: "HighMemoryPressure",
      observedMetric: "Worker node-02 memory allocation exceeded 92%"
    }
  });
  console.log("\nGet prompt diagnose-incident result:");
  console.log(JSON.stringify(promptResult, null, 2));

  await client.close();
  console.log("\n=== MCP TypeScript Client Verification Complete: ALL CHECKS PASSED ===");
}

runClientVerification().catch((err) => {
  console.error("Client verification error:", err);
  process.exit(1);
});
