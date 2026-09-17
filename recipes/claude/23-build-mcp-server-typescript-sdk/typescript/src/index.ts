import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

/**
 * Model Context Protocol Server for Production Cluster Management.
 * Implements tools, static resources, dynamic resource templates, and prompt templates.
 */

// In-memory operational state for cluster telemetry and deployments
interface ClusterNode {
  nodeId: string;
  role: "control-plane" | "worker";
  status: "Ready" | "NotReady";
  cpuCores: number;
  memoryGb: number;
}

const clusterNodes: Record<string, ClusterNode> = {
  "node-01": { nodeId: "node-01", role: "control-plane", status: "Ready", cpuCores: 8, memoryGb: 32 },
  "node-02": { nodeId: "node-02", role: "worker", status: "Ready", cpuCores: 16, memoryGb: 64 },
  "node-03": { nodeId: "node-03", role: "worker", status: "Ready", cpuCores: 16, memoryGb: 64 },
};

// Initialize the high-level McpServer
export const server = new McpServer({
  name: "cluster-ops-server",
  version: "1.0.0"
});

/**
 * 1. Tools: Register deterministic execution tools with Zod input validation schemas.
 */

// Tool: calculate_cluster_health
server.tool(
  "calculate_cluster_health",
  "Computes cluster reliability, node availability, and operational health score.",
  {
    clusterId: z.string().min(1).describe("Unique cluster identifier (e.g. prod-us-east-1)"),
    activeErrors: z.number().int().nonnegative().describe("Count of unresolved errors in monitoring window"),
    windowMinutes: z.number().int().positive().default(15).describe("Monitoring time window in minutes")
  },
  async ({ clusterId, activeErrors, windowMinutes }) => {
    const totalNodes = Object.keys(clusterNodes).length;
    const readyNodes = Object.values(clusterNodes).filter((n) => n.status === "Ready").length;
    const availabilityRate = totalNodes > 0 ? readyNodes / totalNodes : 0;
    const errorPenalty = Math.min(activeErrors * 0.02, 0.5);
    const score = Math.max(0, Math.round((availabilityRate - errorPenalty) * 100) / 100);

    const isDegraded = score < 0.9;
    const status = isDegraded ? "DEGRADED" : "HEALTHY";

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            clusterId,
            status,
            healthScore: score,
            totalNodes,
            readyNodes,
            activeErrors,
            windowMinutes,
            evaluationTimestamp: new Date().toISOString()
          }, null, 2)
        }
      ]
    };
  }
);

// Tool: drain_node
server.tool(
  "drain_node",
  "Safely drains workloads from a worker node for maintenance, updating node state.",
  {
    nodeId: z.string().describe("Target node identifier to drain"),
    gracePeriodSeconds: z.number().int().positive().default(60).describe("Grace period for pod evictions in seconds")
  },
  async ({ nodeId, gracePeriodSeconds }) => {
    const node = clusterNodes[nodeId];
    if (!node) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error: Node "${nodeId}" not found in cluster inventory.`
          }
        ]
      };
    }

    if (node.role === "control-plane") {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Security constraint: Cannot drain control-plane node "${nodeId}".`
          }
        ]
      };
    }

    node.status = "NotReady";

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            message: `Node ${nodeId} successfully drained and marked NotReady.`,
            nodeId,
            status: node.status,
            gracePeriodSeconds,
            drainedAt: new Date().toISOString()
          }, null, 2)
        }
      ]
    };
  }
);

/**
 * 2. Static Resources: Direct read URI endpoints returning JSON telemetry.
 */
server.resource(
  "cluster-manifest",
  "cluster://inventory/manifest",
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        text: JSON.stringify({
          clusterName: "prod-us-east-1",
          region: "us-east-1",
          nodeCount: Object.keys(clusterNodes).length,
          kubernetesVersion: "v1.31.2",
          updatedAt: new Date().toISOString()
        }, null, 2),
        mimeType: "application/json"
      }
    ]
  })
);

/**
 * 3. Dynamic Resource Templates: Parametric URI routes using ResourceTemplate.
 */
server.resource(
  "node-details",
  new ResourceTemplate("cluster://nodes/{nodeId}/telemetry", { list: undefined }),
  async (uri, { nodeId }) => {
    const node = clusterNodes[String(nodeId)];
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    return {
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify({
            node,
            memoryAllocatedPercentage: 73.4,
            loadAverage: [1.24, 0.98, 0.85],
            reportedAt: new Date().toISOString()
          }, null, 2),
          mimeType: "application/json"
        }
      ]
    };
  }
);

/**
 * 4. Prompt Templates: Reusable prompt structures for LLM reasoning.
 */
server.prompt(
  "diagnose-incident",
  "Creates a structured root-cause diagnosis prompt for Claude given an alert and cluster.",
  {
    clusterId: z.string().describe("Identifier of the affected cluster"),
    alertName: z.string().describe("Alert name triggering incident"),
    observedMetric: z.string().describe("Metric description and observed value")
  },
  ({ clusterId, alertName, observedMetric }) => ({
    description: `Incident Diagnosis for ${alertName} on ${clusterId}`,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: [
            `You are an on-call reliability engineer investigating incident: ${alertName}.`,
            `Cluster: ${clusterId}`,
            `Observed telemetry: ${observedMetric}`,
            `Analyze potential failure modes, evaluate whether node draining is warranted, and recommend exact MCP tool calls to restore operational health.`
          ].join("\n\n")
        }
      }
    ]
  })
);

/**
 * Server Lifecycle: Connect via standard input/output transport.
 */
export async function runServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("Cluster Ops MCP Server running on Stdio transport.\n");
}

if (process.argv[1] && (process.argv[1].endsWith("index.ts") || process.argv[1].endsWith("index.js"))) {
  runServer().catch((error) => {
    process.stderr.write(`Fatal error running MCP Server: ${error}\n`);
    process.exit(1);
  });
}
