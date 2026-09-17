"""
Stop Reasons and Max Token Truncation Handler for Anthropic Claude.

This module provides production patterns for inspecting Claude stop reasons,
handling cutoff boundaries, and orchestrating continuation loops when
stop_reason == "max_tokens".
"""

from __future__ import annotations

import os
import sys
from typing import Generator, List, Optional
import anthropic
from anthropic.types import Message, TextBlock


def inspect_stop_reason(message: Message) -> None:
    """Log and validate the stop_reason on a completed Messages API response."""
    print(f"Message ID: {message.id}")
    print(f"Model: {message.model}")
    print(f"Stop Reason: {message.stop_reason}")
    print(f"Stop Sequence: {message.stop_sequence}")
    print(f"Usage: Input={message.usage.input_tokens}, Output={message.usage.output_tokens}")

    if message.stop_reason == "end_turn":
        print("Status: Natural conclusion reached.")
    elif message.stop_reason == "max_tokens":
        print("Status: Output truncated due to max_tokens limit.")
    elif message.stop_reason == "stop_sequence":
        print(f"Status: Execution stopped by custom stop sequence: {message.stop_sequence}")
    elif message.stop_reason == "tool_use":
        print("Status: Model stopped to invoke a tool.")
    else:
        print(f"Status: Unexpected stop reason: {message.stop_reason}")


def generate_with_continuation(
    client: anthropic.Anthropic,
    prompt: str,
    system: Optional[str] = None,
    model: str = "claude-3-5-sonnet-20241022",
    max_tokens_per_call: int = 1000,
    max_continuation_rounds: int = 5,
) -> str:
    """
    Execute a prompt and automatically loop if truncated by max_tokens.

    When stop_reason is "max_tokens", the accumulated response text is appended
    as an assistant turn, followed by a user prompt requesting continuation
    from the exact cutoff point without repeating previous text.
    """
    messages: List[dict] = [{"role": "user", "content": prompt}]
    accumulated_segments: List[str] = []
    round_count = 0

    while round_count < max_continuation_rounds:
        round_count += 1
        kwargs = {
            "model": model,
            "max_tokens": max_tokens_per_call,
            "messages": messages,
        }
        if system:
            kwargs["system"] = system

        response: Message = client.messages.create(**kwargs)

        # Extract text content from the blocks
        round_text = "".join(
            block.text for block in response.content if isinstance(block, TextBlock)
        )
        accumulated_segments.append(round_text)

        print(
            f"[Round {round_count}] Tokens: in={response.usage.input_tokens}, "
            f"out={response.usage.output_tokens} | Stop Reason: {response.stop_reason}"
        )

        if response.stop_reason == "end_turn":
            # Natural completion
            break
        elif response.stop_reason == "max_tokens":
            # Output truncated, prepare next turn
            messages.append({"role": "assistant", "content": round_text})
            messages.append(
                {
                    "role": "user",
                    "content": (
                        "Continue generating your output from the exact point where you "
                        "were cut off. Do not repeat any prior text, acknowledge this instruction, "
                        "or prepend commentary. Resume directly."
                    ),
                }
            )
        elif response.stop_reason == "stop_sequence":
            print(f"Terminated by custom sequence: {response.stop_sequence}")
            break
        elif response.stop_reason == "tool_use":
            print("Encountered tool invocation during text continuation loop.")
            break
        else:
            print(f"Unknown stop reason: {response.stop_reason}. Exiting continuation.")
            break

    return "".join(accumulated_segments)


def stream_with_stop_reason_check(
    client: anthropic.Anthropic,
    prompt: str,
    max_tokens: int = 500,
    model: str = "claude-3-5-sonnet-20241022",
) -> str:
    """Stream response tokens in real-time and extract final stop reason cleanly."""
    collected_text = []

    with client.messages.stream(
        model=model,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        for text in stream.text_stream:
            print(text, end="", flush=True)
            collected_text.append(text)

        final_message = stream.get_final_message()
        print(f"\n[Stream Completed] Stop Reason: {final_message.stop_reason}")
        print(f"[Tokens] Input={final_message.usage.input_tokens}, Output={final_message.usage.output_tokens}")

    return "".join(collected_text)


def main() -> None:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY is not set in environment.", file=sys.stderr)
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    print("=== Demo 1: Triggering and Inspecting max_tokens Cutoff ===")
    short_resp = client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=20,
        messages=[
            {
                "role": "user",
                "content": "Explain the raft consensus protocol step by step.",
            }
        ],
    )
    inspect_stop_reason(short_resp)

    print("\n=== Demo 2: Triggering stop_sequence ===")
    seq_resp = client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=100,
        stop_sequences=["--END--"],
        messages=[
            {
                "role": "user",
                "content": "Count from 1 to 10. Place --END-- after number 4.",
            }
        ],
    )
    inspect_stop_reason(seq_resp)

    print("\n=== Demo 3: Automated Continuation Loop on max_tokens ===")
    continuation_result = generate_with_continuation(
        client=client,
        prompt="Write a detailed, structured 4-section guide on database indexing strategies.",
        max_tokens_per_call=80,
        max_continuation_rounds=3,
    )
    print("\n--- Final Consolidated Text (Preview first 200 chars) ---")
    print(continuation_result[:200] + "...")


if __name__ == "__main__":
    main()
