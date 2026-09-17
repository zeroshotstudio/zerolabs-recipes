import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import crypto from "crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const PORT = parseInt(process.env.MCP_PORT || "8000", 10);
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || "default-insecure-dev-token-change-in-production";

// Initialize core MCP Server instance
const mcpServer = new Server(
  {
    name: "ProductionRemoteOpsTS",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register Available Tools
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "query_system_metrics",
        description: "Retrieve operational health metrics from the remote server environment.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "execute_database_diagnostics",
        description: "Run read-only database cluster connection diagnostics.",
        inputSchema: {
          type: "object",
          properties: {
            cluster_id: { type: "string", description: "Target database cluster identifier" },
          },
          required: ["cluster_id"],
        },
      },
    ],
  };
});

// Handle Tool Execution Requests
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "query_system_metrics") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "healthy",
            load_average: [0.12, 0.08, 0.05],
            uptime_seconds: 86400,
            active_tenants: 4,
            protocol_version: "2024-11-05",
          }),
        },
      ],
    };
  }

  if (name === "execute_database_diagnostics") {
    const clusterId = args?.cluster_id as string;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            cluster_id: clusterId,
            connection_pool: { active: 12, idle: 28, max: 50 },
            replication_lag_ms: 1.4,
            status: "synchronized",
          }),
        },
      ],
    };
  }

  throw new Error(`Tool not found: ${name}`);
});

// Track active SSE transports by sessionId
const activeTransports = new Map<string, SSEServerTransport>();

// Express Application Setup
const app = express();
app.use(cors({ origin: "*", exposedHeaders: ["Mcp-Session-Id"] }));

// Constant-time token verification middleware
const authenticateBearer = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized", message: "Valid Bearer token required" });
    return;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const tokenBuffer = Buffer.from(token);
  const secretBuffer = Buffer.from(AUTH_TOKEN);

  if (tokenBuffer.length !== secretBuffer.length || !crypto.timingSafeEqual(tokenBuffer, secretBuffer)) {
    res.status(401).json({ error: "Unauthorized", message: "Invalid Bearer token" });
    return;
  }

  next();
};

// Health Check Probe
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "online",
    service: "remote-mcp-server-ts",
    active_sessions: activeTransports.size,
  });
});

// SSE Handshake Endpoint
app.get("/sse", authenticateBearer, async (req: Request, res: Response) => {
  const transport = new SSEServerTransport("/messages", res);
  const sessionId = transport.sessionId;
  activeTransports.set(sessionId, transport);

  res.setHeader("Mcp-Session-Id", sessionId);

  req.on("close", () => {
    activeTransports.delete(sessionId);
  });

  await mcpServer.connect(transport);
});

// JSON-RPC Post Message Endpoint
app.post("/messages", authenticateBearer, async (req: Request, res: Response) => {
  const sessionId = (req.query.sessionId as string) || (req.headers["mcp-session-id"] as string);

  if (!sessionId || !activeTransports.has(sessionId)) {
    res.status(400).json({ error: "Bad Request", message: "Invalid or expired sessionId" });
    return;
  }

  const transport = activeTransports.get(sessionId)!;
  await transport.handlePostMessage(req, res);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Production Remote MCP Server (TS) listening on http://0.0.0.0:${PORT}`);
});
