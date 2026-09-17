"""
Extended Thinking Budget and Effort Parameters Implementation for Claude.

Demonstrates configuring thinking parameters on Claude 3.7+ via the official Anthropic SDK.
Validates parameter constraints:
- budget_tokens >= 1024
- max_tokens > budget_tokens
- temperature must be 1.0 or omitted
Parses thinking and text content blocks, signature tokens, and usage metrics.
"""

from __future__ import annotations

import os
import sys
from typing import Any, Dict, List, Optional
import anthropic
from anthropic.types import Message


def run_thinking_query(
    prompt: str,
    budget_tokens: int = 2048,
    max_tokens: int = 4096,
    model: str = "claude-3-7-sonnet-20250219",
) -> Message:
    """
    Execute a Messages API request with extended thinking enabled.

    Args:
        prompt: User task requiring deep reasoning.
        budget_tokens: Thinking budget token limit (minimum 1,024).
        max_tokens: Total output limit (must be strictly greater than budget_tokens).
        model: Thinking-capable model identifier.

    Returns:
        Message object containing thinking and text blocks.
    """
    if budget_tokens < 1024:
        raise ValueError(f"budget_tokens must be >= 1024, received {budget_tokens}")

    if max_tokens <= budget_tokens:
        raise ValueError(
            f"max_tokens ({max_tokens}) must be strictly greater than budget_tokens ({budget_tokens})"
        )

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY environment variable is required.", file=sys.stderr)
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    print(f"Dispatching query with thinking budget: {budget_tokens} tokens (max_tokens: {max_tokens})...")

    # Important: temperature, top_p, and top_k must remain default (temperature=1) when thinking is enabled
    response = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        thinking={
            "type": "enabled",
            "budget_tokens": budget_tokens,
        },
        messages=[
            {
                "role": "user",
                "content": prompt,
            }
        ],
    )
    return response


def inspect_thinking_response(response: Message) -> None:
    """Inspect and display thinking blocks and response usage metrics."""
    print("=" * 65)
    print(f"Message ID : {response.id}")
    print(f"Model      : {response.model}")
    print(f"Stop Reason: {response.stop_reason}")
    print("-" * 65)

    thinking_content: Optional[str] = None
    signature: Optional[str] = None
    final_text: Optional[str] = None

    for block in response.content:
        if block.type == "thinking":
            thinking_content = getattr(block, "thinking", "")
            signature = getattr(block, "signature", None)
        elif block.type == "text":
            final_text = getattr(block, "text", "")

    if thinking_content:
        print("\n--- Model Reasoning Trace (Extended Thinking) ---")
        preview = thinking_content.strip()
        if len(preview) > 300:
            print(f"{preview[:300]}...\n[Truncated reasoning trace: {len(preview)} chars total]")
        else:
            print(preview)
        if signature:
            print(f"Verification Signature: {signature[:32]}... (Cryptographically verifiable)")

    if final_text:
        print("\n--- Final Synthesized Response ---")
        preview_text = final_text.strip()
        if len(preview_text) > 300:
            print(f"{preview_text[:300]}...")
        else:
            print(preview_text)

    print("-" * 65)
    print("Token Usage Breakdown:")
    print(f"  Input Tokens : {response.usage.input_tokens}")
    print(f"  Output Tokens: {response.usage.output_tokens}")
    print("=" * 65)


def main() -> None:
    prompt = (
        "Analyze the architectural trade-offs between Raft consensus and Paxos "
        "when designing a globally distributed write-heavy coordination service. "
        "Summarize key failure recovery bottlenecks."
    )

    budget = int(os.environ.get("THINKING_BUDGET_TOKENS", "2048"))
    max_tok = int(os.environ.get("MAX_TOKENS", "4096"))
    model = os.environ.get("ANTHROPIC_MODEL", "claude-3-7-sonnet-20250219")

    response = run_thinking_query(
        prompt=prompt,
        budget_tokens=budget,
        max_tokens=max_tok,
        model=model,
    )
    inspect_thinking_response(response)


if __name__ == "__main__":
    main()
