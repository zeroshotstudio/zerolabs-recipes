"""
Async Streaming Thinking Blocks Parser for Anthropic Claude.

Demonstrates real-time parsing of Server-Sent Events (SSE) including:
- content_block_start (type: "thinking")
- content_block_delta (type: "thinking_delta")
- content_block_delta (type: "signature_delta")
- content_block_stop
- content_block_start (type: "text")
- content_block_delta (type: "text_delta")
- content_block_stop
- message_delta (token usage)
"""

from __future__ import annotations

import asyncio
import os
import sys
import time
from typing import Optional
from dotenv import load_dotenv

import anthropic

load_dotenv()

API_KEY = os.environ.get("ANTHROPIC_API_KEY")
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-3-7-sonnet-20250219")


class ThinkingStreamState:
    """Tracks state transitions across thinking and answer blocks."""

    def __init__(self) -> None:
        self.thinking_text: str = ""
        self.signature: str = ""
        self.answer_text: str = ""
        self.current_block_type: Optional[str] = None
        self.thinking_started_at: Optional[float] = None
        self.thinking_elapsed_ms: float = 0.0
        self.text_started_at: Optional[float] = None
        self.text_elapsed_ms: float = 0.0
        self.output_tokens: int = 0


async def stream_thinking_response(prompt: str, budget_tokens: int = 2048) -> ThinkingStreamState:
    """
    Initiates an asynchronous stream with extended thinking enabled,
    routing thinking deltas and text deltas to dedicated handlers.
    """
    client = anthropic.AsyncAnthropic(api_key=API_KEY)
    state = ThinkingStreamState()

    print(f"Connecting to {MODEL} with thinking budget of {budget_tokens} tokens...")
    print("-" * 65)

    async with client.messages.stream(
        model=MODEL,
        max_tokens=4096,
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
    ) as stream:
        async for event in stream:
            event_type = event.type

            if event_type == "content_block_start":
                block = event.content_block
                state.current_block_type = block.type

                if block.type == "thinking":
                    state.thinking_started_at = time.perf_counter()
                    print("\n[STATE: THINKING STARTED] Collapsible accordion expanding...")
                elif block.type == "text":
                    state.text_started_at = time.perf_counter()
                    print("\n[STATE: ANSWER STARTED] Thinking complete. Rendering answer...")

            elif event_type == "content_block_delta":
                delta = event.delta

                if delta.type == "thinking_delta":
                    thinking_chunk = delta.thinking
                    state.thinking_text += thinking_chunk
                    # Display stream indicator or thinking snippet
                    sys.stdout.write(f"\r[THINKING ACCORDION] Buffered {len(state.thinking_text)} characters...")
                    sys.stdout.flush()

                elif delta.type == "signature_delta":
                    state.signature += delta.signature
                    print(f"\n[SIGNATURE] Captured verification signature ({len(state.signature)} chars)")

                elif delta.type == "text_delta":
                    text_chunk = delta.text
                    state.answer_text += text_chunk
                    sys.stdout.write(text_chunk)
                    sys.stdout.flush()

            elif event_type == "content_block_stop":
                if state.current_block_type == "thinking":
                    if state.thinking_started_at:
                        state.thinking_elapsed_ms = (time.perf_counter() - state.thinking_started_at) * 1000
                    print(f"\n[STATE: THINKING CLOSED] Finalized in {state.thinking_elapsed_ms:.1f}ms")
                elif state.current_block_type == "text":
                    if state.text_started_at:
                        state.text_elapsed_ms = (time.perf_counter() - state.text_started_at) * 1000
                    print(f"\n[STATE: ANSWER COMPLETE] Generated in {state.text_elapsed_ms:.1f}ms")

                state.current_block_type = None

            elif event_type == "message_delta":
                if hasattr(event, "usage") and event.usage:
                    state.output_tokens = event.usage.output_tokens

    print("\n" + "=" * 65)
    print("STREAMING METRICS SUMMARY:")
    print(f"Thinking Duration: {state.thinking_elapsed_ms:.2f} ms")
    print(f"Answer Duration:   {state.text_elapsed_ms:.2f} ms")
    print(f"Thinking Length:   {len(state.thinking_text)} characters")
    print(f"Answer Length:     {len(state.answer_text)} characters")
    print(f"Total Output Tokens: {state.output_tokens}")
    print("=" * 65)

    return state


async def main() -> None:
    if not API_KEY:
        print("ERROR: ANTHROPIC_API_KEY is not configured.", file=sys.stderr)
        print("Set it via: export ANTHROPIC_API_KEY='sk-ant-api03...'", file=sys.stderr)
        sys.exit(1)

    prompt = (
        "Develop an algorithmic strategy to calculate the median of two sorted "
        "arrays of different sizes in O(log(min(n, m))) time complexity. "
        "Detail your internal trade-offs before presenting the final Python implementation."
    )
    await stream_thinking_response(prompt, budget_tokens=2048)


if __name__ == "__main__":
    asyncio.run(main())
