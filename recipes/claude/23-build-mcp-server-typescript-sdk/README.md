# Recipe 23: How to Build an MCP Server with TypeScript SDK

Production Model Context Protocol (MCP) server implementation using TypeScript, the official `@modelcontextprotocol/sdk`, and Zod schema validation.

## Features

- **High-Level McpServer Architecture**: Implements standard protocol version `2024-11-05` using the clean `McpServer` abstraction.
- **Typed Tools with Zod**: Declarative parameter validation with runtime constraints, error isolation, and structured text/json outputs.
- **Static & Dynamic Resources**: Direct URI-based content delivery and parameterized URI routing using `ResourceTemplate`.
- **Reusable Prompt Templates**: Exposes standardized operational prompts for LLM workflows.
- **Stdio Transport**: Sub-millisecond local process IPC suitable for desktop Claude, Cursor, and automated headless agent runtimes.
- **Automated Verification Client**: Standalone test suite executing tool calls, resource queries, and prompt retrieval.

## Project Structure

```
.
├── .env.example              # Sample runtime configuration
├── metadata.json             # Recipe specification metadata
├── README.md                 # Architecture documentation and quickstart
├── test_probe.sh             # Sub-5-second automated test probe
└── typescript/
    ├── package.json          # Node dependencies (@modelcontextprotocol/sdk, zod)
    ├── tsconfig.json         # TypeScript compiler configuration (ES2022, NodeNext)
    └── src/
        ├── index.ts          # McpServer declaration (tools, resources, prompts, transport)
        └── client.ts         # Client test harness validating protocol capabilities
```

## Quickstart

### 1. Install Dependencies and Build

```bash
cd typescript
npm install
npm run build
```

### 2. Run the Verification Client

The client initializes the server child process over standard input/output (`stdio`), tests capability negotiation, lists tools/resources/prompts, and validates end-to-end execution:

```bash
npm run client
```

### 3. Run the Automated Test Probe

Execute the end-to-end verification probe to validate build and runtime performance in under 5 seconds:

```bash
./test_probe.sh
```

## Integrating with Claude Desktop / Cursor

Add the compiled server to your Claude Desktop configuration (`claude_desktop_config.json`) or Cursor MCP configuration:

```json
{
  "mcpServers": {
    "cluster-ops": {
      "command": "node",
      "args": [
        "/absolute/path/to/23-build-mcp-server-typescript-sdk/typescript/dist/index.js"
      ]
    }
  }
}
```

## Production Verification SLAs

- **Build Time**: < 3.0s
- **Stdio Initialization**: < 150ms
- **Tool Execution Latency**: < 15ms
