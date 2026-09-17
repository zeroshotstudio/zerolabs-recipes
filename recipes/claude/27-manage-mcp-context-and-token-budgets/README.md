# Recipe 27: Manage MCP Tool Context and Token Budgets

A high-performance context routing, dynamic schema pruning, and prompt caching proxy for Model Context Protocol (MCP) tool clusters in Anthropic Claude pipelines.

## Architecture

When agents connect to enterprise MCP ecosystems (database engines, GitHub, file systems, cloud metrics), registering 30+ tool definitions consumes thousands of input tokens on every turn before the model even processes user queries.

This recipe provides a dual-strategy token optimization layer:
1. **Dynamic Tool Filtering**: Indexes all available MCP tools into category and keyword sets. At query time, it selects only the most relevant tools (Top-K) rather than dumping the entire cluster into the request.
2. **Schema Pruning**: Dynamically strips non-essential JSON schema bloat (multi-line documentation examples, comment fields, excessive descriptions) while strictly preserving property keys, data types, and required field constraints.
3. **Anthropic Prompt Caching**: Appends `cache_control: {"type": "ephemeral"}` to the terminal tool definition in the `tools` array, cutting recurring input token costs by 90% and slashing time-to-first-token latency.

## Directory Layout

```
27-manage-mcp-context-and-token-budgets/
├── .env.example
├── README.md
├── metadata.json
├── measure_token_impact.py
├── python/
│   └── mcp_context_router.py
└── typescript/
    ├── package.json
    ├── tsconfig.json
    └── src/
        └── mcp_context_router.ts
```

## Quickstart

### Python

```bash
cd python
python3 mcp_context_router.py
```

### TypeScript

```bash
cd typescript
npm install
npm run build
npm start
```

### Measuring Token & Cost Reductions

Run the benchmark script to compare naive uncached payloads against pruned, routed, and cached configurations:

```bash
python3 measure_token_impact.py
```

Sample Benchmark Output:
```
================================================================
 MCP Tool Context and Token Budget Impact Benchmark
================================================================
Total Available Cluster Tools   : 28
Raw Tools Payload Size          : 3,102 tokens
Pruned Tools Payload Size       : 2,783 tokens (10.3% reduction)
Routed & Pruned (Top 4 Tools)   : 448 tokens (85.6% reduction)
----------------------------------------------------------------
Multi-Turn Cost Profile (10 User Turns):
1. Naive Uncached (Full 28 tools) : $0.0931 (31,020 input tokens)
2. Raw + Ephemeral Prompt Caching : $0.0200 (Cache Hit Rate: 90%)
3. Routed + Pruned (Uncached)     : $0.0134 (4,480 input tokens)
4. Routed + Pruned + Caching      : $0.0029 (Optimal Efficiency)
==> Total Cumulative Cost Savings : 96.9%
================================================================
```
