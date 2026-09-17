"""
Cache Hit Rate Telemetry and Debugging Middleware for Anthropic Claude.

This module provides production patterns for inspecting Claude prompt cache usage,
calculating cache hit rates, measuring TTFT / total latency deltas, and preventing
common cache-busting pitfalls.
"""

from __future__ import annotations

import os
import sys
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
import anthropic
from anthropic.types import Message


@dataclass
class CacheMetrics:
    """Telemetry data capturing token counts and latency deltas for a Messages API call."""
    input_tokens: int
    cache_creation_input_tokens: int
    cache_read_input_tokens: int
    output_tokens: int
    latency_ms: float
    total_prompt_tokens: int = field(init=False)
    cache_hit_rate_pct: float = field(init=False)
    cost_savings_pct: float = field(init=False)

    def __post_init__(self) -> None:
        self.total_prompt_tokens = (
            self.input_tokens + self.cache_creation_input_tokens + self.cache_read_input_tokens
        )
        if self.total_prompt_tokens > 0:
            self.cache_hit_rate_pct = (self.cache_read_input_tokens / self.total_prompt_tokens) * 100.0
        else:
            self.cache_hit_rate_pct = 0.0

        # Anthropic caching economics:
        # Base input = 1.0x price
        # Cache creation = 1.25x price (25% surcharge for 5-minute TTL write)
        # Cache read = 0.10x price (90% discount)
        # Baseline cost assuming no caching = total_prompt_tokens * 1.0
        # Actual cost = (input_tokens * 1.0) + (cache_creation * 1.25) + (cache_read * 0.10)
        baseline = float(self.total_prompt_tokens)
        actual = (
            float(self.input_tokens) * 1.0
            + float(self.cache_creation_input_tokens) * 1.25
            + float(self.cache_read_input_tokens) * 0.10
        )
        if baseline > 0:
            self.cost_savings_pct = max(0.0, ((baseline - actual) / baseline) * 100.0)
        else:
            self.cost_savings_pct = 0.0


def calculate_cache_metrics(message: Message, duration_seconds: float) -> CacheMetrics:
    """Extract cache usage metrics and compute analytical ratios from an Anthropic Message."""
    usage = message.usage
    input_tokens = getattr(usage, "input_tokens", 0)
    cache_creation = getattr(usage, "cache_creation_input_tokens", 0) or 0
    cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
    output_tokens = getattr(usage, "output_tokens", 0)

    return CacheMetrics(
        input_tokens=input_tokens,
        cache_creation_input_tokens=cache_creation,
        cache_read_input_tokens=cache_read,
        output_tokens=output_tokens,
        latency_ms=duration_seconds * 1000.0,
    )


class CachedAnthropicTelemetry:
    """
    Telemetry middleware wrapping Anthropic client calls to aggregate
    prompt cache hit/miss statistics and identify cache busting patterns.
    """

    def __init__(self, client: anthropic.Anthropic) -> None:
        self.client = client
        self.history: List[CacheMetrics] = []

    def create_message(self, **kwargs: Any) -> tuple[Message, CacheMetrics]:
        """Execute a Messages API call with high-resolution latency and cache telemetry tracking."""
        start_time = time.perf_counter()
        message = self.client.messages.create(**kwargs)
        duration = time.perf_counter() - start_time

        metrics = calculate_cache_metrics(message, duration)
        self.history.append(metrics)
        self.log_metrics(metrics)
        return message, metrics

    def log_metrics(self, m: CacheMetrics) -> None:
        """Log structured telemetry output to stdout."""
        status = "HIT" if m.cache_read_input_tokens > 0 else ("WRITE" if m.cache_creation_input_tokens > 0 else "MISS")
        print(f"[Telemetry] Status: {status} | Hit Rate: {m.cache_hit_rate_pct:.1f}% | "
              f"Read: {m.cache_read_input_tokens} tok | Created: {m.cache_creation_input_tokens} tok | "
              f"Uncached: {m.input_tokens} tok | Latency: {m.latency_ms:.1f}ms | "
              f"Est Savings: {m.cost_savings_pct:.1f}%")

    def get_aggregate_summary(self) -> Dict[str, float]:
        """Compute aggregate statistics across all recorded requests in the session."""
        if not self.history:
            return {"requests": 0.0, "avg_hit_rate": 0.0, "total_saved_tokens": 0.0}

        total_read = sum(m.cache_read_input_tokens for m in self.history)
        total_created = sum(m.cache_creation_input_tokens for m in self.history)
        total_uncached = sum(m.input_tokens for m in self.history)
        total_prompt = total_read + total_created + total_uncached

        avg_hit_rate = (total_read / total_prompt * 100.0) if total_prompt > 0 else 0.0
        return {
            "requests": float(len(self.history)),
            "avg_hit_rate_pct": round(avg_hit_rate, 2),
            "total_cache_read_tokens": float(total_read),
            "total_cache_creation_tokens": float(total_created),
            "total_uncached_tokens": float(total_uncached),
        }


def run_cache_diagnostic_demo() -> None:
    """
    Demonstration harness:
    1. Runs cold call (verifies cache_creation_input_tokens > 0).
    2. Runs warm call (verifies cache_read_input_tokens > 0 and measures latency drop).
    3. Demonstrates prefix mutation pitfall (cache bust).
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY environment variable is missing.", file=sys.stderr)
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)
    telemetry = CachedAnthropicTelemetry(client)

    # Large boilerplate (>1,024 tokens) to meet the caching threshold
    large_knowledge_base = (
        "Enterprise Architecture Specifications Version 4.2.1. "
        + "System protocol documentation block for cluster validation. " * 120
    )

    print("\n--- 1. Cold Call: Initial Cache Creation ---")
    _, m1 = telemetry.create_message(
        model="claude-3-5-sonnet-20241022",
        max_tokens=100,
        system=[
            {
                "type": "text",
                "text": large_knowledge_base,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": "Confirm cluster state in one word."}],
    )

    print("\n--- 2. Warm Call: Deterministic Cache Read ---")
    _, m2 = telemetry.create_message(
        model="claude-3-5-sonnet-20241022",
        max_tokens=100,
        system=[
            {
                "type": "text",
                "text": large_knowledge_base,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": "List active protocol names."}],
    )

    print("\n--- 3. Busted Call: Non-Deterministic Timestamp Mutated Prefix ---")
    busted_prompt = f"Timestamp: {time.time()} - {large_knowledge_base}"
    _, m3 = telemetry.create_message(
        model="claude-3-5-sonnet-20241022",
        max_tokens=100,
        system=[
            {
                "type": "text",
                "text": busted_prompt,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": "List active protocol names."}],
    )

    print("\n--- Session Aggregate Summary ---")
    summary = telemetry.get_aggregate_summary()
    for k, v in summary.items():
        print(f"{k}: {v}")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--demo":
        run_cache_diagnostic_demo()
    else:
        print("CachedAnthropicTelemetry module loaded. Run with --demo to execute live API calls.")
