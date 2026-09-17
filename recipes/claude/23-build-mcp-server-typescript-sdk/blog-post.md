> **Key Takeaways:** The Model Context Protocol (MCP) establishes an open, standardized bridge connecting Claude and autonomous coding agents to local developer tools, databases, and operational infrastructure without bespoke API glue.
>
> Building an MCP server in TypeScript with the official `@modelcontextprotocol/sdk` leverages high-level `McpServer` primitives, providing end-to-end type safety, runtime schema enforcement via Zod, and automated protocol capability negotiation.
>
> Implementing tools, static resources, dynamic resource templates, and prompt templates under a unified `StdioServerTransport` delivers deterministic, low-latency IPC tailored for Claude Desktop, Cursor, and automated CI/CD agent harnesses.

Connecting large language models to live systems has historically suffered from fragmented integration patterns. Every framework introduced bespoke function wrappers, ad-hoc JSON specifications, and brittle schema parsers. The Model Context Protocol changes this paradigm by formalizing client-server interactions around three primary capabilities: executable tools for side effects, readable resources for context injection, and structured prompts for repeatable agent workflows.

In our production environments at ZeroShot Studio, deterministic execution is non-negotiable. Autonomous agents cannot afford runtime argument hallucinations, unhandled exceptions in socket connections, or ambiguous tool descriptions. By pairing the official TypeScript MCP SDK with Zod runtime validation, we enforce strict boundary contracts at the compiler level and during process execution.

This guide walks through building an enterprise-grade MCP server using TypeScript and the `@modelcontextprotocol/sdk`. We examine protocol architecture, implement executable operational tools, expose static and dynamic telemetry resources, register reusable prompt templates, and verify end-to-end execution with an automated test client.

Companion repository: [ZeroLabs TypeScript MCP Server Recipe](https://github.com/zeroshotstudio/zerolabs-recipes/tree/main/recipes/claude/23-build-mcp-server-typescript-sdk).

## Contents

- [What Is the Model Context Protocol Architecture?](#what-is-the-model-context-protocol-architecture)
- [How Do MCP Primitives Compare: Tools vs Resources vs Prompts?](#how-do-mcp-primitives-compare-tools-vs-resources-vs-prompts)
- [How Does the TypeScript MCP SDK Handle Protocol Lifecycle?](#how-does-the-typescript-mcp-sdk-handle-protocol-lifecycle)
- [How to Set Up the TypeScript MCP Server Project?](#how-to-set-up-the-typescript-mcp-server-project)
- [How to Implement Tools with Zod Validation?](#how-to-implement-tools-with-zod-validation)
- [How to Expose Static and Dynamic Telemetry Resources?](#how-to-expose-static-and-dynamic-telemetry-resources)
- [How to Define Structured Prompt Templates?](#how-to-define-structured-prompt-templates)
- [How to Connect and Run the Stdio Transport?](#how-to-connect-and-run-the-stdio-transport)
- [How to Verify the Server with an Automated Client?](#how-to-verify-the-server-with-an-automated-client)
- [How to Wire the Server into Claude Desktop and Cursor?](#how-to-wire-the-server-into-claude-desktop-and-cursor)
- [What Are Production Best Practices for MCP Servers?](#what-are-production-best-practices-for-mcp-servers)
- [FAQ](#faq)

## What Is the Model Context Protocol Architecture?

The Model Context Protocol operates as an open standard based on JSON-RPC 2.0 messages exchanged over pluggable transports. The specification designates protocol version `2024-11-05` as the baseline standard for capability negotiation, framing, and structured error propagation.

In standard deployments, an MCP client (such as Claude Desktop, Cursor, or an autonomous CLI worker) spawns the MCP server as a managed child process. Communication occurs across standard input and output channels (`stdio`), eliminating network overhead, port contention, and authentication token exposure on localhost. For distributed services, the protocol also supports HTTP with Server-Sent Events (SSE).

```
+-------------------------------------------------------------------------+
|                              MCP Client                                 |
|            (Claude Desktop / Cursor / Autonomous Agent Runtime)         |
+------------------------------------+------------------------------------+
                                     |
                          JSON-RPC 2.0 (stdio / SSE)
                                     |
+------------------------------------+------------------------------------+
|                         McpServer (TypeScript SDK)                      |
|                                                                         |
|  +---------------------+  +---------------------+  +-----------------+  |
|  |     Tools Engine    |  |   Resource Manager  |  |  Prompt Handler |  |
|  |   Zod Schema Parser |  | Static URIs / Templ |  | Parameter Subs  |  |
|  +----------+----------+  +----------+----------+  +--------+--------+  |
|             |                        |                      |           |
+-------------|------------------------|----------------------|-----------+
              |                        |                      |
              v                        v                      v
     [Cluster Operations]      [System Telemetry]     [Incident Runbooks]
```

When the client launches the server process, both endpoints execute a deterministic three-way handshake:
1. **Initialize Request**: The client transmits supported protocol versions and client capability flags.
2. **Initialize Response**: The server returns its server identity, version string, instructions, and enabled capability sets (`tools`, `resources`, `prompts`).
3. **Initialized Notification**: The client acknowledges initialization, enabling live operations.

To inspect how tools are defined and consumed directly within Claude before protocol wrapping, review our deep dive on [how to define and register tools with Claude](https://labs.zeroshot.studio/resources/how-to-define-and-register-tools-with-claude).

## How Do MCP Primitives Compare: Tools vs Resources vs Prompts?

MCP servers expose three distinct functional primitives to client models. Selecting the correct primitive ensures Claude interacts with external state predictably:

| Primitive | Primary Purpose | Model Interaction Mode | Side Effects | Validation Mechanism |
| :--- | :--- | :--- | :--- | :--- |
| **Tools** | Execute operations and side effects | Model-invoked during dialogue turn | Allowed (write, mutate, call external APIs) | Strict Zod schema validation on arguments |
| **Resources** | Supply passive contextual data | Client-attached or queried via URI | Read-only idempotent lookups | MIME-type negotiation, URI pattern matching |
| **Prompts** | Provide standardized prompt templates | User-selected or workflow-orchestrated | Context framing only | Named parameter substitution |

Tools represent active capabilities, such as calculating health scores, querying relational stores, or cordoning infrastructure nodes. Resources act like read-only endpoints accessible by custom URI schemes (for example, `cluster://metrics/current`). Prompts provide reusable, parameter-driven system templates that guide the model through complex tasks like incident retrospectives or code reviews.

For command-line sandboxing workflows that bridge native execution tools with security boundaries, refer to our operational guide on [how to integrate and sandbox the Claude bash tool](https://labs.zeroshot.studio/resources/how-to-integrate-and-sandbox-the-claude-bash-tool).

## How Does the TypeScript MCP SDK Handle Protocol Lifecycle?

The official TypeScript SDK (`@modelcontextprotocol/sdk`) provides two architectural layers:
- **Low-level Core (`Server`)**: Handles raw JSON-RPC dispatch, request handlers (`setRequestHandler`), and manual JSON Schema objects.
- **High-level Wrapper (`McpServer`)**: Streamlines registration using fluent builders (`server.tool()`, `server.resource()`, `server.prompt()`) with first-class Zod integration.

The `McpServer` abstraction automatically translates Zod schema definitions into compliant JSON Schema objects during the `tools/list` negotiation. When Claude emits a tool call, `McpServer` validates incoming parameters against the Zod schema before executing your callback handler. If validation fails, the SDK catches the error and returns a formatted JSON-RPC error payload directly to the client without terminating the process.

## How to Set Up the TypeScript MCP Server Project?

Let us establish a clean, modern TypeScript project targeting Node.js with native ECMAScript modules (`ES2022`). We configure `tsconfig.json` with strict type checking and `NodeNext` resolution.

### Project Layout

```
23-build-mcp-server-typescript-sdk/
├── metadata.json
├── package.json
├── tsconfig.json
├── test_probe.sh
└── src/
    ├── index.ts      # Server entrypoint with tools, resources, and prompts
    └── client.ts     # Standalone verification test client
```

### Package Manifest (`package.json`)

Configure dependencies, build scripts, and ESM module type:

```json
{
  "name": "cluster-ops-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "description": "Production TypeScript MCP Server for infrastructure cluster operations",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "client": "tsx src/client.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.30.0",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@types/node": "^22.13.10",
    "tsx": "^4.19.3",
    "typescript": "^5.8.2"
  }
}
```

### TypeScript Compiler Configuration (`tsconfig.json`)

Ensure strict type safety and modern module resolution:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"]
}
```

## How to Implement Tools with Zod Validation?

Tools are declared using `server.tool(name, description, parameterSchema, callback)`. The parameter schema accepts an object map of Zod types. Each field should include `.describe()` annotations to guide Claude's reasoning during parameter selection.

In this production cluster management example, we implement two tools:
1. `calculate_cluster_health`: Evaluates cluster reliability metrics based on active errors and monitoring intervals.
2. `drain_node`: Safely updates node lifecycle state while enforcing security constraints against draining control-plane instances.

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const server = new McpServer({
  name: "cluster-ops-server",
  version: "1.0.0"
});

// In-memory cluster state for demonstration
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
```

Notice the error handling pattern in `drain_node`. Returning `{ isError: true, content: [...] }` informs Claude of operational failures cleanly without crashing the background process transport.

## How to Expose Static and Dynamic Telemetry Resources?

Resources provide contextual visibility into read-only files, database views, and live telemetry feeds. The TypeScript SDK supports two registration patterns:
1. **Static URI Resources**: Registered with a concrete URI string (such as `cluster://inventory/manifest`).
2. **Dynamic Parametric Resources**: Registered using the `ResourceTemplate` class with route variables (such as `cluster://nodes/{nodeId}/telemetry`).

```typescript
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

// Static Resource: Cluster inventory manifest
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

// Dynamic Resource: Parametric node telemetry
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
```

When an agent requests `cluster://nodes/node-02/telemetry`, `ResourceTemplate` extracts `{ nodeId: "node-02" }` and injects it directly into the second callback argument.

## How to Define Structured Prompt Templates?

Prompt templates define standardized interaction patterns for users or autonomous workflows. They guide Claude into specific operational personas and structure complex prompts systematically.

```typescript
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
```

When retrieved by an MCP client, the template parameters are populated and rendered into the dialogue history before generation starts.

## How to Connect and Run the Stdio Transport?

To expose the server to local clients, attach `StdioServerTransport` to the `McpServer` instance:

```typescript
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

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
```

> [!IMPORTANT]
> When implementing stdio transports in Node.js, never write debugging logs or arbitrary text to `console.log()` or `process.stdout`. Any non-JSON data emitted on stdout corrupts the JSON-RPC message framing and terminates the client connection. Always emit diagnostic messages to `process.stderr`.

## How to Verify the Server with an Automated Client?

To ensure reliability before deploying an MCP server to developer workstations, we maintain a standalone TypeScript test client using `Client` and `StdioClientTransport`.

Create `src/client.ts`:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runClientVerification() {
  console.log("=== Starting MCP TypeScript Verification Client ===");

  const serverScript = path.resolve(__dirname, "index.ts");

  // Launch the server child process over stdio
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", serverScript]
  });

  const client = new Client(
    { name: "verification-client", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log("Connected to MCP server via stdio.");

  // 1. Tool discovery and invocation
  const toolsResponse = await client.listTools();
  console.log(`Discovered ${toolsResponse.tools.length} tools:`);
  for (const tool of toolsResponse.tools) {
    console.log(`  - ${tool.name}: ${tool.description}`);
  }

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
  const staticRes = await client.readResource({ uri: "cluster://inventory/manifest" });
  console.log("\nRead static resource cluster://inventory/manifest:");
  console.log(JSON.stringify(staticRes, null, 2));

  const dynamicRes = await client.readResource({ uri: "cluster://nodes/node-02/telemetry" });
  console.log("\nRead dynamic template resource cluster://nodes/node-02/telemetry:");
  console.log(JSON.stringify(dynamicRes, null, 2));

  // 3. Prompt templates
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
```

### Executing the Automated Probe

Run the client script directly using `tsx`:

```bash
npm run client
```

Output verification trace:

```
=== Starting MCP TypeScript Verification Client ===
Cluster Ops MCP Server running on Stdio transport.
Connected to MCP server via stdio.
Discovered 2 tools:
  - calculate_cluster_health: Computes cluster reliability, node availability, and operational health score.
  - drain_node: Safely drains workloads from a worker node for maintenance, updating node state.

Invocation calculate_cluster_health result:
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"clusterId\": \"prod-us-east-1\",\n  \"status\": \"HEALTHY\",\n  \"healthScore\": 0.96,\n  \"totalNodes\": 3,\n  \"readyNodes\": 3,\n  \"activeErrors\": 2,\n  \"windowMinutes\": 30,\n  \"evaluationTimestamp\": \"2026-09-17T11:45:38.783Z\"\n}"
    }
  ]
}

Read static resource cluster://inventory/manifest:
{
  "contents": [
    {
      "uri": "cluster://inventory/manifest",
      "mimeType": "application/json",
      "text": "{\n  \"clusterName\": \"prod-us-east-1\",\n  \"region\": \"us-east-1\",\n  \"nodeCount\": 3,\n  \"kubernetesVersion\": \"v1.31.2\",\n  \"updatedAt\": \"2026-09-17T11:45:38.788Z\"\n}"
    }
  ]
}

Read dynamic template resource cluster://nodes/node-02/telemetry:
{
  "contents": [
    {
      "uri": "cluster://nodes/node-02/telemetry",
      "mimeType": "application/json",
      "text": "{\n  \"node\": {\n    \"nodeId\": \"node-02\",\n    \"role\": \"worker\",\n    \"status\": \"Ready\",\n    \"cpuCores\": 16,\n    \"memoryGb\": 64\n  },\n  \"memoryAllocatedPercentage\": 73.4,\n  \"loadAverage\": [\n    1.24,\n    0.98,\n    0.85\n  ],\n  \"reportedAt\": \"2026-09-17T11:45:38.790Z\"\n}"
    }
  ]
}

Get prompt diagnose-incident result:
{
  "description": "Incident Diagnosis for HighMemoryPressure on prod-us-east-1",
  "messages": [
    {
      "role": "user",
      "content": {
        "type": "text",
        "text": "You are an on-call reliability engineer investigating incident: HighMemoryPressure.\n\nCluster: prod-us-east-1\n\nObserved telemetry: Worker node-02 memory allocation exceeded 92%\n\nAnalyze potential failure modes, evaluate whether node draining is warranted, and recommend exact MCP tool calls to restore operational health."
      }
    }
  ]
}

=== MCP TypeScript Client Verification Complete: ALL CHECKS PASSED ===
```

## How to Wire the Server into Claude Desktop and Cursor?

Once verified locally, register the server within your client configuration files.

### Claude Desktop Configuration

Edit `claude_desktop_config.json` (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS or `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "cluster-ops": {
      "command": "node",
      "args": [
        "/absolute/path/to/23-build-mcp-server-typescript-sdk/typescript/dist/index.js"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### Cursor MCP Configuration

In Cursor, navigate to **Settings > Features > MCP**, click **Add New MCP Server**, and configure:
- **Name**: `cluster-ops`
- **Type**: `command`
- **Command**: `node /absolute/path/to/23-build-mcp-server-typescript-sdk/typescript/dist/index.js`

Restart the client. The hammer icon in Claude Desktop or Cursor's Composer panel will illuminate, listing `calculate_cluster_health` and `drain_node` as available tools.

## What Are Production Best Practices for MCP Servers?

Deploying MCP servers into shared engineering workflows requires disciplined error isolation, defensive logging, and execution safeguards:

1. **Protect Standard Output**: Never use `console.log()` inside stdio server implementations. Reserve `process.stderr` for operational telemetry and audit logs.
2. **Handle Errors Defensively**: Return `{ isError: true, content: [{ type: "text", text: "..." }] }` inside tool handlers rather than letting exceptions bubble up and unseat the transport.
3. **Annotate Every Zod Property**: Always call `.describe()` on Zod properties. Claude relies directly on these descriptions to infer context, types, units, and acceptable value boundaries.
4. **Constrain Side Effects**: In tools that execute stateful operations (like database mutations or node draining), implement safety confirmation flags or check permissions prior to execution.
5. **Enforce Clean Subprocess Teardown**: Listen for `SIGINT` and `SIGTERM` signals within the server process to cleanly flush connections and terminate child handles.

For official protocol documentation, specification updates, and SDK reference architectures, visit the [Model Context Protocol Documentation](https://modelcontextprotocol.io/).

## FAQ

### What is the difference between `@modelcontextprotocol/sdk` and building a custom JSON-RPC server?
The official SDK implements the exact Model Context Protocol specification (`protocolVersion 2024-11-05`), including capability negotiation, standard error schemas, transport abstraction, and high-level Zod schema validation. Building from scratch risks protocol version drift and broken framing.

### Can an MCP server run over HTTP or WebSockets instead of stdio?
Yes. The SDK includes SSE transports (`SSEServerTransport`) for remote deployment scenarios over HTTP. However, stdio is standard for local agent workflows because it requires zero open ports and eliminates localhost authentication overhead.

### How does Claude know when to call an MCP tool?
During initialization, the MCP client queries the server via `tools/list`. The server serializes the Zod schemas into standard JSON Schema objects. Claude analyzes user prompts and autonomously invokes matching tools when external state or execution is necessary.

### How do I debug an MCP server when Claude Desktop fails to connect?
Inspect the Claude Desktop developer logs (`tail -f ~/Library/Logs/Claude/mcp*.log` on macOS). Common causes include non-JSON output written to stdout, missing executable permissions, or unresolved module paths.
