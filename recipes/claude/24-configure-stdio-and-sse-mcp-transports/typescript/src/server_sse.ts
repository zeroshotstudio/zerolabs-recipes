import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express, { Request, Response } from "express";

// Initialize core MCP Server instance
const server = new Server(
  {
    name: "ts-transport-showcase-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tool listing handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "health_check",
        description: "Returns process uptime, memory consumption, and transport runtime statistics.",
        inputSchema: {
          type: "object",
          properties: {
            detailed: {
              type: "boolean",
              description: "Include memory layout and node environment stats.",
            },
          },
        },
      },
    ],
  };
});

// Register tool execution handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "health_check") {
    throw new Error(`Tool not found: ${request.params.name}`);
  }

  const detailed = Boolean(request.params.arguments?.detailed);
  const memoryUsage = process.memoryUsage();

  const diagnosticData = {
    status: "healthy",
    uptimeSeconds: Math.floor(process.uptime()),
    pid: process.pid,
    nodeVersion: process.version,
    memory: detailed
      ? {
          heapUsedMb: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2),
          heapTotalMb: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2),
          rssMb: (memoryUsage.rss / 1024 / 1024).toFixed(2),
        }
      : undefined,
  };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(diagnosticData, null, 2),
      },
    ],
  };
});

async function runStdio(): Promise<void> {
  console.error("[MCP] Initializing Stdio transport...");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[MCP] Stdio transport successfully connected.");
}

function runSSE(host: string, port: number): void {
  const app = express();
  let sseTransport: SSEServerTransport | null = null;

  // Endpoint 1: SSE Handshake and persistent stream
  app.get("/sse", async (req: Request, res: Response) => {
    console.error("[MCP] Inbound SSE connection initialized from", req.ip);
    
    // Construct transport targeting the downstream message POST path
    sseTransport = new SSEServerTransport("/messages", res);
    
    // Connect server to transport
    await server.connect(sseTransport);

    req.on("close", () => {
      console.error("[MCP] Client terminated SSE connection.");
    });
  });

  // Endpoint 2: Client JSON-RPC dispatch endpoint
  app.post("/messages", async (req: Request, res: Response) => {
    if (!sseTransport) {
      res.status(400).json({ error: "SSE transport stream not active. Initialize /sse first." });
      return;
    }
    console.error("[MCP] Processing inbound JSON-RPC message payload");
    await sseTransport.handlePostMessage(req, res);
  });

  app.listen(port, host, () => {
    console.error(`[MCP] SSE Transport Server listening at http://${host}:${port}`);
    console.error(`[MCP] SSE Stream: http://${host}:${port}/sse`);
    console.error(`[MCP] Messages:   http://${host}:${port}/messages`);
  });
}

// Bootstrap selector based on CLI arguments
const transportMode = process.argv.includes("--transport")
  ? process.argv[process.argv.indexOf("--transport") + 1]
  : process.env.MCP_TRANSPORT || "sse";

const host = process.env.MCP_HOST || "127.0.0.1";
const port = parseInt(process.env.MCP_PORT || "8000", 10);

if (transportMode === "stdio") {
  runStdio().catch((err) => {
    console.error("[MCP Fatal] Stdio transport failure:", err);
    process.exit(1);
  });
} else {
  runSSE(host, port);
}
