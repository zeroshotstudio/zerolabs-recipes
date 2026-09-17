"""
Prompt Caching Breakpoints Implementation for Anthropic Claude.

Demonstrates configuring ephemeral cache breakpoints on system prompts,
tools declarations, and large document context blocks.
Inspects cache_creation_input_tokens and cache_read_input_tokens.
"""

from __future__ import annotations

import os
import sys
from typing import Any, Dict, List
import anthropic
from anthropic.types import Message


# Synthetic technical corpus exceeding the 1,024 token minimum for Sonnet/Opus
SAMPLE_TECHNICAL_SPEC = """
ZERO-SHOT STUDIO DISTRIBUTED AGENT RUNTIME SPECIFICATION (VERSION 4.2)
======================================================================
1. SYSTEM TOPOLOGY AND INTER-PROCESS COMMUNICATION
The ZeroLabs agent orchestrator deploys supervisor nodes and worker pools
across isolated runtime containers. Supervisor processes supervise execution
lifecycles, route task dispatches via Unix domain sockets, and monitor worker
heartbeats at 500-millisecond intervals.

When a worker process experiences an unrecoverable exception or memory limit
violation, the supervisor traps the termination signal, snapshots execution
registers, isolates corrupt state vectors, and respawns a clean worker within
75 milliseconds. Inter-agent messages are serialized into binary flatbuffers
and cryptographically signed using ephemeral session tokens.

2. PROMPT CACHING ARCHITECTURE AND PREFIX COMPACTION
Frontier language model requests incur substantial token processing overhead
when multi-turn conversations accumulate large document schemas, tool manifests,
and contextual memories. Anthropic prompt caching eliminates redundant compute
by storing the key-value (KV) activations of the prompt prefix in accelerator
memory across a rolling 5-minute time-to-live (TTL) window.

To achieve maximum cache utilization:
a. Static system instructions must be positioned at the start of the request.
b. Reusable tool declarations must be placed immediately following system text.
c. Stable document context or retrieval-augmented generation (RAG) knowledge
   chunks must precede dynamic conversation turns.
d. Dynamic user inputs, transient memory recalls, and run-specific variables
   must remain strictly after the final cache breakpoint.

3. BREAKPOINT LIMITS AND TOKEN THRESHOLDS
The Messages API supports up to four explicit cache breakpoints per request
using the cache_control: {"type": "ephemeral"} block attribute.
For Claude 3.5 Sonnet and Claude 3 Opus, the minimum cacheable prefix length
is 1,024 tokens. For Claude 3.5 Haiku, the minimum threshold is 2,048 tokens.
Requests specifying breakpoints on prefixes smaller than these model thresholds
execute normally without caching, returning zero cache_creation_input_tokens.

4. CACHE INVALIDATION AND DETERMINISTIC HASHING
The caching engine constructs prefix hashes hierarchically. A cache breakpoint
at index K is valid only if all content preceding index K remains identical
in character composition, ordering, and block structure. Any modification to
an early system prompt block invalidates all downstream breakpoints within that
request hierarchy.
""" * 3  # Multiplied to guarantee > 1,500 tokens


SAMPLE_TOOLS: List[Dict[str, Any]] = [
    {
        "name": "lookup_cluster_health",
        "description": "Retrieve health metrics, pod counts, and saturation scores for an agent cluster.",
        "input_schema": {
            "type": "object",
            "properties": {
                "cluster_id": {
                    "type": "string",
                    "description": "The unique cluster identifier (e.g., prod-us-east-1).",
                },
                "metric_window_seconds": {
                    "type": "integer",
                    "description": "Rolling evaluation window in seconds.",
                    "default": 300,
                },
            },
            "required": ["cluster_id"],
        },
    },
    {
        "name": "restart_worker_node",
        "description": "Trigger a graceful restart of an unresponsive agent worker container.",
        "input_schema": {
            "type": "object",
            "properties": {
                "node_id": {
                    "type": "string",
                    "description": "The identifier of the node to restart.",
                },
                "drain_timeout_seconds": {
                    "type": "integer",
                    "description": "Time allocated for draining in-flight requests before SIGKILL.",
                    "default": 30,
                },
            },
            "required": ["node_id"],
        },
        # Mark the last tool with a cache breakpoint so tools are cached together
        "cache_control": {"type": "ephemeral"},
    },
]


def inspect_cache_metrics(turn_label: str, message: Message) -> None:
    """Print structured token usage highlighting cache creation vs cache reads."""
    usage = message.usage
    input_tokens = usage.input_tokens
    cache_creation = getattr(usage, "cache_creation_input_tokens", 0) or 0
    cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
    output_tokens = usage.output_tokens

    print(f"\n[{turn_label}] Message ID: {message.id}")
    print(f"  Input Tokens (Uncached): {input_tokens}")
    print(f"  Cache Creation Tokens:   {cache_creation}")
    print(f"  Cache Read Tokens:       {cache_read}")
    print(f"  Output Tokens:           {output_tokens}")

    total_input = input_tokens + cache_creation + cache_read
    if total_input > 0:
        cache_percentage = (cache_read / total_input) * 100
        print(f"  Cache Efficiency Ratio:  {cache_percentage:.1f}%")

    if cache_creation > 0:
        print("  Status: Cache breakpoint created and stored in KV memory.")
    elif cache_read > 0:
        print("  Status: Cache HIT! Accelerated prefix read from KV memory.")
    else:
        print("  Status: Cache MISS or below token threshold.")


def execute_caching_lifecycle() -> None:
    """Demonstrate a two-turn conversation lifecycle with prompt caching."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY is not set.", file=sys.stderr)
        sys.exit(1)

    model = os.environ.get("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022")
    client = anthropic.Anthropic(api_key=api_key)

    # 1. Prepare system prompt blocks with cache_control on the static specification
    system_blocks: List[Dict[str, Any]] = [
        {
            "type": "text",
            "text": SAMPLE_TECHNICAL_SPEC,
            "cache_control": {"type": "ephemeral"},
        }
    ]

    print("=== Step 1: Initial Turn (Cache Creation) ===")
    first_response = client.messages.create(
        model=model,
        max_tokens=150,
        system=system_blocks,  # type: ignore[arg-type]
        tools=SAMPLE_TOOLS,  # type: ignore[arg-type]
        messages=[
            {
                "role": "user",
                "content": "According to Section 3, what are the minimum token thresholds for caching?",
            }
        ],
    )

    inspect_cache_metrics("Turn 1 (Initial Call)", first_response)
    print(f"  Response: {first_response.content[0].text[:120]}...\n")  # type: ignore[union-attr]

    print("=== Step 2: Follow-up Turn (Cache Read) ===")
    second_response = client.messages.create(
        model=model,
        max_tokens=150,
        system=system_blocks,  # type: ignore[arg-type]
        tools=SAMPLE_TOOLS,  # type: ignore[arg-type]
        messages=[
            {
                "role": "user",
                "content": "According to Section 3, what are the minimum token thresholds for caching?",
            },
            {
                "role": "assistant",
                "content": first_response.content,  # type: ignore[arg-type]
            },
            {
                "role": "user",
                "content": "What is the supervisor restart window specified in Section 1?",
            },
        ],
    )

    inspect_cache_metrics("Turn 2 (Cached Follow-up)", second_response)
    print(f"  Response: {second_response.content[0].text[:120]}...\n")  # type: ignore[union-attr]


if __name__ == "__main__":
    execute_caching_lifecycle()
