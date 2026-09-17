import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

/**
 * Custom TypeScript MCP Server for Claude Desktop and Cursor.
 * Demonstrates stdio transport, environment variable isolation, and schema validation.
 */

// Initialize McpServer instance
const server = new McpServer({
  name: "custom-typescript-mcp",
  version: "1.0.0"
});

// Tool: ping
server.tool(
  "ping",
  "Echoes input text with process ID and environment status to test stdio pipe connectivity.",
  {
    message: z.string().describe("Message text to echo back")
  },
  async ({ message }) => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "ok",
            echo: message,
            pid: process.pid,
            debug: process.env.MCP_DEBUG === "true",
            timestamp: new Date().toISOString()
          }, null, 2)
        }
      ]
    };
  }
);

// Tool: verify_environment
server.tool(
  "verify_environment",
  "Verifies environment variables injected by Claude Desktop or Cursor client configs.",
  {},
  async () => {
    const debugVal = process.env.MCP_DEBUG ?? "false";
    const secretKey = process.env.API_SECRET_KEY ?? "";

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "healthy",
            mcp_debug: debugVal,
            secret_present: Boolean(secretKey),
            secret_length: secretKey.length,
            cwd: process.cwd()
          }, null, 2)
        }
      ]
    };
  }
);

// Static Resource: system://telemetry
server.resource(
  "system-telemetry",
  "system://telemetry",
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        text: JSON.stringify({
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          memoryUsage: process.memoryUsage(),
          timestamp: new Date().toISOString()
        }, null, 2),
        mimeType: "application/json"
      }
    ]
  })
);

// Prompt Template: client-diagnostics
server.prompt(
  "client-diagnostics",
  "Generates an interactive diagnostic prompt for Claude to evaluate MCP client health.",
  {
    clientName: z.string().describe("Client name: 'Claude Desktop' or 'Cursor'"),
    errorMessage: z.string().describe("Reported error or symptom")
  },
  ({ clientName, errorMessage }) => ({
    description: `Diagnostics for ${clientName}`,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `You are troubleshooting an MCP connection failure in ${clientName}.\nError message: "${errorMessage}".\nCheck configuration paths, ensure stdio stdout is clear of debug logs, and test server execution using verify_environment.`
        }
      }
    ]
  })
);

/**
 * Main server startup function
 */
export async function runServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Important: stdio logging must use stderr only
  process.stderr.write("Custom TypeScript MCP Server started on Stdio transport.\n");
}

runServer().catch((error) => {
  process.stderr.write(`Fatal error running Custom TypeScript MCP Server: ${error}\n`);
  process.exit(1);
});
