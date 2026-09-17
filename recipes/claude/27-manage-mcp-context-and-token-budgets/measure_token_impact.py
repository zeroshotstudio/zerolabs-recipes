import copy
import json
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "python"))
from mcp_context_router import MCPToolContextRouter, generate_sample_mcp_cluster


def estimate_tokens(obj: any) -> int:
    """Heuristic token estimator (~4 chars per token for JSON payload representation)."""
    text = json.dumps(obj, separators=(",", ":"))
    return max(1, len(text) // 4)


def run_benchmark():
    cluster = generate_sample_mcp_cluster()

    # Expand cluster artificially to simulate an enterprise registry with 28 tools
    expanded_cluster = {}
    for server_name, tools in cluster.items():
        expanded_cluster[server_name] = []
        for i in range(4):
            for t in tools:
                cloned = copy.deepcopy(t)
                cloned["name"] = f"{t['name']}_v{i+1}"
                expanded_cluster[server_name].append(cloned)

    total_tools = sum(len(tools) for tools in expanded_cluster.values())
    raw_tools = []
    for tools in expanded_cluster.values():
        for t in tools:
            clean_t = copy.deepcopy(t)
            clean_t.pop("category", None)
            clean_t.pop("tags", None)
            raw_tools.append(clean_t)

    raw_tokens = estimate_tokens(raw_tools)

    # 1. Test Pruned-only
    pruned_router = MCPToolContextRouter(enable_caching=False, enable_pruning=True)
    for srv, tools in expanded_cluster.items():
        pruned_router.register_server_tools(srv, tools)

    all_pruned_tools = [pruned_router.prune_schema(t) for t in raw_tools]
    pruned_tokens = estimate_tokens(all_pruned_tools)

    # 2. Test Dynamic Routing + Pruning
    query = "Find customer orders and run explain analyze on the postgres database"
    routed_tools = pruned_router.route_tools(query, top_k=4)
    routed_pruned_tokens = estimate_tokens(routed_tools)

    print("================================================================")
    print(" MCP Tool Context and Token Budget Impact Benchmark")
    print("================================================================")
    print(f"Total Available Cluster Tools   : {total_tools}")
    print(f"Raw Tools Payload Size          : {raw_tokens:,} tokens")
    print(f"Pruned Tools Payload Size       : {pruned_tokens:,} tokens ({((raw_tokens - pruned_tokens) / raw_tokens) * 100:.1f}% reduction)")
    print(f"Routed & Pruned (Top 4 Tools)   : {routed_pruned_tokens:,} tokens ({((raw_tokens - routed_pruned_tokens) / raw_tokens) * 100:.1f}% reduction)")
    print("----------------------------------------------------------------")
    print("Multi-Turn Cost Profile (10 User Turns):")

    # Uncached cost (raw tools repeated 10 turns)
    cost_per_1k = 0.003  # Claude 3.5 / 3.7 Sonnet base input pricing ($3.00 / 1M)
    cache_read_per_1k = 0.0003  # 90% discount ($0.30 / 1M)
    cache_write_per_1k = 0.00375  # 25% surcharge for cache write ($3.75 / 1M)

    uncached_total_tokens = raw_tokens * 10
    uncached_cost = (uncached_total_tokens / 1000) * cost_per_1k

    # Routed + Pruned without cache
    routed_uncached_tokens = routed_pruned_tokens * 10
    routed_uncached_cost = (routed_uncached_tokens / 1000) * cost_per_1k

    # Cached (1 write turn + 9 read turns)
    cached_cost = ((raw_tokens / 1000) * cache_write_per_1k) + ((raw_tokens * 9 / 1000) * cache_read_per_1k)

    # Routed + Cached (1 write turn + 9 read turns)
    routed_cached_cost = ((routed_pruned_tokens / 1000) * cache_write_per_1k) + ((routed_pruned_tokens * 9 / 1000) * cache_read_per_1k)

    print(f"1. Naive Uncached (Full 28 tools) : ${uncached_cost:.4f} ({uncached_total_tokens:,} input tokens)")
    print(f"2. Raw + Ephemeral Prompt Caching : ${cached_cost:.4f} (Cache Hit Rate: 90%)")
    print(f"3. Routed + Pruned (Uncached)     : ${routed_uncached_cost:.4f} ({routed_uncached_tokens:,} input tokens)")
    print(f"4. Routed + Pruned + Caching      : ${routed_cached_cost:.4f} (Optimal Efficiency)")
    savings_pct = ((uncached_cost - routed_cached_cost) / uncached_cost) * 100
    print(f"==> Total Cumulative Cost Savings : {savings_pct:.1f}%")
    print("================================================================")


if __name__ == "__main__":
    run_benchmark()
