> **Key Takeaway:** Multi-server MCP architectures inject thousands of tool definition tokens into every turn before conversation history begins. By implementing dynamic tool routing, schema pruning, and Anthropic prompt caching breakpoints on the `tools` array, teams reduce tool token overhead by over 85% and cut recurring input token costs by 90%.

When production AI agents orchestrate multiple Model Context Protocol ([MCP](https://modelcontextprotocol.io)) servers (spanning databases, code repositories, filesystem tools, and monitoring), the tool catalog expands rapidly. A cluster of five MCP servers can expose 35 distinct tools, consuming between 3,500 and 6,000 input tokens per request before conversation history begins.

Transmitting thousands of static tool definition tokens on every turn exhausts context windows, raises inference bills, and introduces latency. Without proactive token budget controls, multi-turn agent conversations quickly trigger rate limits or window exhaustion.

In this guide, we walk through our team's strategy for managing MCP context and token budgets. We demonstrate how to prune verbose JSON schemas without degrading validation, filter tools dynamically based on user intent, and place Anthropic prompt caching breakpoints (`cache_control: {"type": "ephemeral"}`) directly on tool arrays to maximize cache hits.

Companion code repository: [ZeroLabs Claude Recipes Monorepo](https://github.com/zeroshotstudio/zerolabs-recipes/tree/main/recipes/claude/27-manage-mcp-context-and-token-budgets).

## Contents

- [The Root Problem: Tool Schema Bloat in Multi-Server MCP](#the-root-problem-tool-schema-bloat-in-multi-server-mcp)
- [Architecture of an MCP Context Router](#architecture-of-an-mcp-context-router)
- [Technique 1: Schema Pruning and Deserialization Optimization](#technique-1-schema-pruning-and-deserialization-optimization)
- [Technique 2: Dynamic Intent-Based Tool Filtering](#technique-2-dynamic-intent-based-tool-filtering)
- [Technique 3: Prompt Caching Breakpoints on Tools Arrays](#technique-3-prompt-caching-breakpoints-on-tools-arrays)
- [Full Implementation: Python MCP Context Router](#full-implementation-python-mcp-context-router)
- [Full Implementation: TypeScript MCP Context Router](#full-implementation-typescript-mcp-context-router)
- [Measuring Token and Latency Reductions](#measuring-token-and-latency-reductions)
- [Handling Tool Call Output Context Budgets](#handling-tool-call-output-context-budgets)
- [Common Production Pitfalls](#common-production-pitfalls)
- [Verification and Testing Probes](#verification-and-testing-probes)
- [FAQ](#faq)

## The Root Problem: Tool Schema Bloat in Multi-Server MCP

Under the Model Context Protocol specification, an MCP client discovers tools by issuing a `tools/list` JSON-RPC request to each connected server. As shown in our guide on [configuring Stdio and SSE transports in MCP](https://labs.zeroshot.studio/resources/how-to-configure-stdio-and-sse-mcp-transports), servers respond with rich definitions including descriptions, property parameter specifications, nested objects, and validation rules.

When building tools with official SDKs (explored in [defining and registering tools with Claude](https://labs.zeroshot.studio/resources/how-to-define-and-register-tools-with-claude)), developers include extensive documentation: markdown formatting, syntax examples, and annotations. Repeating these strings on every conversational step creates severe context tax:

| MCP Architecture Layer | Tool Count | Uncached Input Tokens / Turn | Cost per 10 Turns (Sonnet) | TTFT Latency Impact |
| :--- | :--- | :--- | :--- | :--- |
| **Single Local Server** | 4 Tools | ~450 tokens | $0.0135 | Negligible (~350ms) |
| **Mid-Size Agent Cluster** | 12 Tools | ~1,600 tokens | $0.0480 | Moderate (+200ms) |
| **Enterprise Multi-Server** | 32 Tools | ~4,200 tokens | $0.1260 | High (+650ms) |
| **Enterprise + DB Schemas** | 50+ Tools | ~7,500+ tokens | $0.2250+ | Severe (+1,200ms) |

When an agent executes an autonomous 15-step loop to debug a service or refactor code, transmitting 4,200 tokens of tool overhead on every step consumes 63,000 tokens just on tool definitions alone.

## Architecture of an MCP Context Router

To maintain low latency and predictable token consumption across large tool clusters, we deploy an intermediary context management layer between the MCP client connections and the Claude Messages API client.

The router performs three distinct operations:
1. **Aggregates and Categorizes:** Ingests tools from all connected MCP transports and maps them into functional domains such as database, vcs, filesystem, and monitoring.
2. **Prunes Schemas:** Strips non-functional metadata such as example payloads, verbose multi-line descriptions, and comment fields while maintaining schema integrity.
3. **Filters Dynamically and Caches:** Evaluates user prompt intent to select the top relevant tools, then attaches `cache_control: {"type": "ephemeral"}` to the last selected tool.

## Technique 1: Schema Pruning and Deserialization Optimization

When tool schemas are authored via Pydantic or TypeScript JSON schema generators, the resulting JSON schemas often include extraneous properties that the Claude model does not require to construct valid tool call arguments:
- `examples` or `example` arrays
- Multi-line description text explaining edge cases
- `$schema` and `$comment` metadata
- Verbose title strings on individual properties

Here is a comparison of a raw tool definition versus its pruned counterpart:

### Raw Verbose Tool Schema (145 tokens)
```json
{
  "name": "db_query_execute",
  "description": "Execute read-only SQL queries against Postgres.\nExample: SELECT * FROM customers;",
  "input_schema": {
    "type": "object",
    "properties": {
      "sql": {
        "type": "string",
        "description": "Valid PostgreSQL query statement. Must be read-only SELECT or EXPLAIN.",
        "examples": ["SELECT COUNT(*) FROM orders;"]
      },
      "timeout_ms": {
        "type": "integer",
        "description": "Timeout in milliseconds before cancelling query cursor.",
        "default": 5000
      }
    },
    "required": ["sql"]
  }
}
```

### Pruned Lean Tool Schema (76 tokens)
```json
{
  "name": "db_query_execute",
  "description": "Execute read-only SQL queries against Postgres.",
  "input_schema": {
    "type": "object",
    "properties": {
      "sql": { "type": "string", "description": "Valid read-only PostgreSQL query." },
      "timeout_ms": { "type": "integer", "default": 5000 }
    },
    "required": ["sql"]
  }
}
```

Notice that the pruned schema preserves the exact parameter types, field names, defaults, and `required` arrays. Claude generates arguments with identical precision, while consuming roughly half the token volume.

## Technique 2: Dynamic Intent-Based Tool Filtering

In many workflows, Claude does not need access to database administrative tools when the user simply asks to edit a local file. Exposing irrelevant tools wastes context and increases the risk of tool selection hallucinations.

Our routing strategy classifies the incoming prompt and extracts the most relevant tools (Top-K) using a lightweight lexical scoring algorithm:
1. **Tool Name Matching (3x weight):** Direct token overlap with the tool identifier.
2. **Category and Tag Matching (2x weight):** Overlap with the tool functional grouping.
3. **Description Overlap (0.5x weight):** Broader semantic matches across the short description.

If an interaction requires sequential multi-step problem solving, the router can maintain an active tool set across turns, expanding tools dynamically as new sub-tasks emerge.

## Technique 3: Prompt Caching Breakpoints on Tools Arrays

As detailed in our guide on [configuring prompt caching breakpoints](https://labs.zeroshot.studio/resources/how-to-configure-prompt-caching-breakpoints), Anthropic prompt caching stores compiled KV attention states across inference turns.

Because tools are evaluated before messages in the prefix hierarchy, placing a cache breakpoint on the tools array allows Claude to cache the entire system prompt and tool definitions together.

```json
{
  "model": "claude-3-7-sonnet-20250219",
  "max_tokens": 1024,
  "system": [
    {
      "type": "text",
      "text": "You are an autonomous engineering agent with access to database tools.",
      "cache_control": {"type": "ephemeral"}
    }
  ],
  "tools": [
    {
      "name": "db_query_execute",
      "description": "Execute read-only SQL queries against the production PostgreSQL cluster.",
      "input_schema": { "type": "object", "properties": { "sql": { "type": "string" } }, "required": ["sql"] },
      "cache_control": {"type": "ephemeral"}
    }
  ],
  "messages": []
}
```

> **The Caching Rule:** Always place `cache_control: {"type": "ephemeral"}` on the terminal element of the `tools` list. This marks the boundary of the static prefix. On subsequent turns, reading the entire tool definition block costs only 10% of base input pricing.

To monitor cache efficiency in real time, review our companion recipe on [measuring and debugging cache hit rates](https://labs.zeroshot.studio/resources/how-to-measure-and-debug-cache-hit-rates).

## Full Implementation: Python MCP Context Router

Below is the complete Python context router implementation for production workloads:

```python
import copy, os, re
from typing import Any, Dict, List, Optional

class MCPToolContextRouter:
    def __init__(self, enable_caching: bool = True, enable_pruning: bool = True, top_k: int = 8):
        self.enable_caching = enable_caching
        self.enable_pruning = enable_pruning
        self.top_k = top_k
        self.registry: Dict[str, Dict[str, Any]] = {}

    def register_server_tools(self, server: str, tools: List[Dict[str, Any]]) -> None:
        for t in tools:
            self.registry[t["name"]] = {"server": server, "tool": copy.deepcopy(t), "category": t.get("category", server), "tags": set(t.get("tags", []))}

    @staticmethod
    def prune_schema(t: Dict[str, Any]) -> Dict[str, Any]:
        p = copy.deepcopy(t)
        if "description" in p:
            p["description"] = p["description"].split("\n")[0][:120]
        for prop in p.get("input_schema", {}).get("properties", {}).values():
            if isinstance(prop, dict):
                for k in ["examples", "example", "$comment", "title"]: prop.pop(k, None)
        p.pop("category", None)
        p.pop("tags", None)
        return p

    def route_tools(self, query: str) -> List[Dict[str, Any]]:
        q = set(re.findall(r"\w+", query.lower()))
        scored = []
        for name, meta in self.registry.items():
            s = len(q & set(re.findall(r"\w+", name.lower()))) * 3.0
            s += len(q & {t.lower() for t in meta["tags"]}) * 1.5
            if s > 0: scored.append((s, name))
        scored.sort(key=lambda x: x[0], reverse=True)
        selected = [n for _, n in scored[:self.top_k]] or list(self.registry.keys())[:self.top_k]
        return [self.prune_schema(self.registry[n]["tool"]) if self.enable_pruning else self.registry[n]["tool"] for n in selected]

    def build_messages_payload(self, messages: List[Dict[str, Any]], system_prompt: str, query: str) -> Dict[str, Any]:
        tools = self.route_tools(query)
        if self.enable_caching and tools: tools[-1]["cache_control"] = {"type": "ephemeral"}
        return {
            "model": os.environ.get("ANTHROPIC_MODEL", "claude-3-7-sonnet-20250219"),
            "max_tokens": 1024,
            "system": [{"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}],
            "messages": messages,
            "tools": tools,
        }
```

## Full Implementation: TypeScript MCP Context Router

For TypeScript and Node.js environments, we provide an equivalent class using the official SDK types:

```typescript
import type { Tool } from "@anthropic-ai/sdk/resources/messages.mjs";

export class MCPContextRouter {
  private registry = new Map<string, { tool: any; category: string; tags: Set<string> }>();
  constructor(private enableCaching = true, private enablePruning = true, private topK = 8) {}

  public registerServerTools(serverName: string, tools: any[]): void {
    for (const tool of tools) {
      this.registry.set(tool.name, {
        tool: structuredClone(tool),
        category: tool.category || serverName,
        tags: new Set(tool.tags || []),
      });
    }
  }

  public pruneSchema(tool: any): Tool {
    const cloned = structuredClone(tool);
    if (cloned.description) {
      const d = cloned.description.trim().split("\n")[0];
      cloned.description = d.length > 120 ? d.substring(0, 120) + "..." : d;
    }
    for (const prop of Object.values(cloned.input_schema?.properties || {})) {
      if (typeof prop === "object" && prop) {
        delete (prop as any).examples;
        delete (prop as any).example;
        delete (prop as any).title;
      }
    }
    delete cloned.category;
    delete cloned.tags;
    return cloned as Tool;
  }

  public routeTools(query: string): Tool[] {
    const qTokens = new Set(query.toLowerCase().match(/\w+/g) || []);
    const scored: Array<{ name: string; score: number }> = [];

    for (const [name, meta] of this.registry.entries()) {
      let score = 0;
      const nTokens = new Set(name.toLowerCase().match(/\w+/g) || []);
      for (const t of qTokens) if (nTokens.has(t)) score += 3.0;
      for (const t of meta.tags) if (qTokens.has(t.toLowerCase())) score += 1.5;
      if (score > 0) scored.push({ name, score });
    }

    scored.sort((a, b) => b.score - a.score);
    const selected = scored.slice(0, this.topK).map((s) => s.name);
    const names = selected.length > 0 ? selected : Array.from(this.registry.keys()).slice(0, this.topK);

    return names.map((name) => {
      const item = this.registry.get(name)!;
      return this.enablePruning ? this.pruneSchema(item.tool) : (item.tool as Tool);
    });
  }

  public buildPayload(query: string, messages: any[], systemInstruction: string) {
    const tools = this.routeTools(query);
    if (this.enableCaching && tools.length > 0) {
      (tools[tools.length - 1] as any).cache_control = { type: "ephemeral" };
    }
    return {
      model: process.env.ANTHROPIC_MODEL || "claude-3-7-sonnet-20250219",
      max_tokens: 1024,
      system: [{ type: "text", text: systemInstruction, cache_control: { type: "ephemeral" } }],
      messages,
      tools,
    };
  }
}
```

## Measuring Token and Latency Reductions

To evaluate the operational impact of these techniques, our benchmark script simulates an enterprise agent interaction across 28 tools spanning four MCP servers over 10 conversational turns.

We compare four deployment architectures:
1. **Naive Uncached:** All 28 tools sent verbatim on every turn.
2. **Raw plus Ephemeral Caching:** All 28 tools sent verbatim with prompt caching enabled.
3. **Routed plus Pruned:** Top 4 relevant tools sent after schema pruning, without caching.
4. **Routed plus Pruned plus Caching:** Top 4 tools pruned and cached with prompt breakpoints.

Sample output from `measure_token_impact.py`:
- Raw tools payload size: 3,102 tokens across 28 tools.
- Pruned tools payload size: 2,783 tokens (10.3% static reduction).
- Routed and pruned payload size: 448 tokens (85.6% reduction).
- 10-turn naive uncached expenditure: $0.0931 across 31,020 input tokens.
- 10-turn routed, pruned, and cached expenditure: $0.0029 across warm cache turns.
- Overall cumulative cost reduction: 96.9% savings compared to naive transmission.

By combining selective routing with prompt caching, the agent pipeline achieves a 96.9% cost reduction and saves over 26,000 input tokens across a standard 10-turn interaction.

## Handling Tool Call Output Context Budgets

Context budgeting does not stop with tool schemas. When an agent invokes a tool, the returned `tool_result` content can also flood the context window. For instance, executing a broad SQL query can return 20,000 tokens of raw JSON text.

To prevent output window overflow, enforce defensive response policies within the MCP client:

1. **Row and Character Limits:** Clamp database query results to a maximum row count (such as 50 rows) and character limit (such as 10,000 characters).
2. **Intermediate Storage via Artifacts:** If a tool generates massive output (such as large build logs or test outputs), write the raw content to disk or object storage and return a condensed summary to Claude along with a file pointer.
3. **Dynamic Truncation:** In your tool execution handler, truncate output payloads if they exceed a set token threshold before injecting them into `tool_result` blocks:

```python
MAX_RESULT_CHARS = 12000

def sanitize_tool_output(raw_output: str) -> str:
    if len(raw_output) > MAX_RESULT_CHARS:
        return (
            raw_output[:MAX_RESULT_CHARS]
            + f"\n\n[Warning: Tool output truncated. {len(raw_output) - MAX_RESULT_CHARS} characters omitted.]"
        )
    return raw_output
```

## Common Production Pitfalls

### 1. Modifying Tool Order Between Turns
Claude evaluates prompt caches strictly from left to right. If your tool router produces tools in non-deterministic order (such as iterating through an un-ordered Python set), the tool prefix hash changes on every turn. This invalidates the cache and forces full re-computation. Always sort routed tools deterministically by name before attaching cache breakpoints.

### 2. Under-Filtering and Context Throttling
Registering 60+ tools simultaneously degrades Claude's tool selection accuracy. Research indicates that presenting models with large registries leads to distractor tools being invoked mistakenly. Keeping the active tool budget between 4 and 10 tools maximizes accuracy while preserving context.

### 3. Stripping Required Schema Fields
When pruning JSON schema descriptors, ensure you never delete `type`, `required`, or nested object `properties`. Removing the `required` array can cause Claude to emit incomplete payloads, triggering tool execution validation errors.

## Verification and Testing Probes

Run our verification suite to confirm that tool routing, schema pruning, and prompt cache breakpoints execute within expected token budgets.

### 1. Test Python Router and Benchmark
```bash
cd projects/zerolabs-recipes/recipes/claude/27-manage-mcp-context-and-token-budgets
python3 measure_token_impact.py
```
Expected output confirms an 85%+ token reduction and verifies prompt caching cost structures.

### 2. Verify TypeScript Router Compilation and Execution
```bash
cd typescript
npm run build
node dist/mcp_context_router.js
```
The test harness initializes the router, registers sample tools, and verifies that the `cache_control` breakpoint is present on the terminal tool definition.

## FAQ

### Does Anthropic prompt caching require a minimum number of tokens?
Yes. Prompt caching activates only when the prompt prefix meets the minimum token threshold: 1,024 tokens for Claude 3.5 Sonnet, Claude 3.7 Sonnet, and Claude 3 Opus, or 2,048 tokens for Claude 3.5 Haiku. If your system prompt plus tool definitions total fewer than 1,024 tokens, requests process as standard uncached tokens until additional context accumulates.

### Can I place cache breakpoints on individual tools?
Yes. You can place `cache_control: {"type": "ephemeral"}` on any tool definition within the `tools` array. However, because requests support a maximum of 4 explicit breakpoints, the standard best practice is to place a single breakpoint on the final tool in the array. This encompasses the entire system prompt and tool definitions in a single cache slice.

### How do I handle tools that require dynamic runtime arguments?
Dynamic tool schemas (such as adding a dynamic database column list) should be cached carefully. If tool schemas change frequently, the prefix hash breaks. Instead of mutating tool schemas dynamically, keep schemas static and pass dynamic runtime parameters inside user message blocks or tool arguments.
