#!/usr/bin/env python3
"""
Claude Prompt Caching Cost Model & Amortized Savings Calculator.
Demonstrates financial cost modeling for 5-minute TTL vs 1-hour extended ephemeral cache,
break-even threshold analysis, and live API usage tracking.
"""

from dataclasses import dataclass
from typing import Dict, List, Optional
import os

# Standard Anthropic model token pricing per million tokens ($/MTok)
MODEL_RATES = {
    "claude-3-5-sonnet-20241022": {
        "base_input": 3.00,
        "cache_write": 3.75,   # 125% of base input
        "cache_read": 0.30,    # 10% of base input (90% discount)
        "output": 15.00,
    },
    "claude-3-haiku-20240307": {
        "base_input": 0.25,
        "cache_write": 0.30,   # 120% of base input
        "cache_read": 0.03,    # 12% of base input
        "output": 1.25,
    },
    "claude-3-opus-20240229": {
        "base_input": 15.00,
        "cache_write": 18.75,  # 125% of base input
        "cache_read": 1.50,    # 10% of base input
        "output": 75.00,
    },
}

@dataclass
class CostComparison:
    uncached_total_cost: float
    cached_total_cost: float
    net_savings: float
    savings_percentage: float
    amortized_cost_per_turn: float
    break_even_hit_count: int

def calculate_cache_economics(
    model: str,
    cached_tokens: int,
    uncached_input_tokens: int,
    output_tokens: int,
    total_turns: int,
) -> CostComparison:
    """
    Calculates exact token expenditures and break-even ROI thresholds
    for a prompt caching workflow across N turns within the cache lifetime window.
    """
    rates = MODEL_RATES.get(model, MODEL_RATES["claude-3-5-sonnet-20241022"])
    
    # 1. Uncached cost: Every turn incurs full base_input cost for all prompt tokens
    uncached_turn_input_cost = ((cached_tokens + uncached_input_tokens) / 1_000_000) * rates["base_input"]
    uncached_turn_output_cost = (output_tokens / 1_000_000) * rates["output"]
    uncached_total_cost = (uncached_turn_input_cost + uncached_turn_output_cost) * total_turns

    # 2. Cached cost:
    # Turn 1 writes cache: cached_tokens * cache_write
    # Turns 2..N read cache: cached_tokens * cache_read
    turn1_input_cost = (
        (cached_tokens / 1_000_000) * rates["cache_write"]
        + (uncached_input_tokens / 1_000_000) * rates["base_input"]
    )
    subsequent_turn_input_cost = (
        (cached_tokens / 1_000_000) * rates["cache_read"]
        + (uncached_input_tokens / 1_000_000) * rates["base_input"]
    )
    cached_turn_output_cost = (output_tokens / 1_000_000) * rates["output"]

    cached_total_cost = turn1_input_cost + cached_turn_output_cost
    if total_turns > 1:
        cached_total_cost += (subsequent_turn_input_cost + cached_turn_output_cost) * (total_turns - 1)

    net_savings = uncached_total_cost - cached_total_cost
    savings_pct = (net_savings / uncached_total_cost) * 100 if uncached_total_cost > 0 else 0.0
    amortized_per_turn = cached_total_cost / total_turns if total_turns > 0 else 0.0

    # Break-even threshold:
    # Initial write premium is 25% over base input cost (1.25x).
    # Each cache read delivers a 90% discount (0.10x base input).
    # Break-even occurs at: 0.25 / 0.90 = 0.28 reads.
    # Therefore, 1 initial write + 1 read (2 requests total) achieves net cost reduction.
    break_even = 2

    return CostComparison(
        uncached_total_cost=round(uncached_total_cost, 6),
        cached_total_cost=round(cached_total_cost, 6),
        net_savings=round(net_savings, 6),
        savings_percentage=round(savings_pct, 2),
        amortized_cost_per_turn=round(amortized_per_turn, 6),
        break_even_hit_count=break_even,
    )

def execute_cached_pipeline(
    client,
    system_prompt: str,
    prompts: List[str],
    model: str = "claude-3-5-sonnet-20241022",
) -> None:
    """
    Demonstrates multi-turn execution with ephemeral caching,
    measuring token usage metrics across write and read operations.
    """
    print(f"Executing pipeline with model '{model}' across {len(prompts)} turns...")

    for i, user_query in enumerate(prompts, start=1):
        response = client.messages.create(
            model=model,
            max_tokens=100,
            system=[
                {
                    "type": "text",
                    "text": system_prompt,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": user_query}],
        )

        u = response.usage
        creation_tokens = getattr(u, "cache_creation_input_tokens", 0) or 0
        read_tokens = getattr(u, "cache_read_input_tokens", 0) or 0
        regular_tokens = u.input_tokens
        out_tokens = u.output_tokens

        turn_type = "CACHE WRITE" if creation_tokens > 0 else ("CACHE HIT" if read_tokens > 0 else "UNCACHED")
        print(f"Turn {i} [{turn_type}]:")
        print(f"  Base In: {regular_tokens} | Cache Write: {creation_tokens} | Cache Read: {read_tokens} | Out: {out_tokens}")

if __name__ == "__main__":
    # 1. Run offline cost simulation
    print("=== Offline Cost Model Simulation ===")
    sim = calculate_cache_economics(
        model="claude-3-5-sonnet-20241022",
        cached_tokens=25_000,
        uncached_input_tokens=250,
        output_tokens=300,
        total_turns=20,
    )
    print(f"Scenario: 25,000 cached tokens over 20 requests within cache lifetime window")
    print(f"Uncached Total Cost:  ${sim.uncached_total_cost:.4f}")
    print(f"Cached Total Cost:    ${sim.cached_total_cost:.4f}")
    print(f"Net Financial Savings: ${sim.net_savings:.4f} ({sim.savings_percentage}%)")
    print(f"Amortized Cost / Req: ${sim.amortized_cost_per_turn:.4f}")
    print(f"Break-Even Threshold: {sim.break_even_hit_count} hits\n")

    # 2. If API key exists and SDK is available, execute live request pipeline
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if api_key:
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=api_key)
            base_doc = "ZeroLabs technical reference specification. Production engineering rules. " * 60
            test_queries = [
                "Summarize the key engineering constraints.",
                "What is the recommended caching policy?",
            ]
            execute_cached_pipeline(client, base_doc, test_queries)
        except ImportError:
            print("Note: anthropic Python SDK not installed. Run 'pip install anthropic' to execute live pipeline.")
    else:
        print("Note: Set ANTHROPIC_API_KEY to run live API cache creation and read calls.")
