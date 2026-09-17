"""
Server-Sent Events (SSE) Streaming with Anthropic Claude in Python.
Demonstrates both raw event iteration and the high-level client.messages.stream() helper.
Includes event type handling (text deltas, JSON deltas, usage) and robust connection handling.
"""

import os
import sys
import time
from typing import Any, Dict
from dotenv import load_dotenv
import anthropic
from anthropic import Anthropic, APIConnectionError, APIStatusError, RateLimitError

load_dotenv()

API_KEY = os.environ.get("ANTHROPIC_API_KEY")
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-3-7-sonnet-20250219")

if not API_KEY:
    print("Error: ANTHROPIC_API_KEY is not set in environment or .env file.", file=sys.stderr)
    sys.exit(1)


def demonstrate_raw_stream(client: Anthropic) -> None:
    """
    Demonstrates manual parsing of raw Server-Sent Events via client.messages.create(stream=True).
    Captures message_start, content_block_start, content_block_delta, content_block_stop,
    message_delta, and message_stop.
    """
    print("\n--- 1. Raw Stream Event Processor (Low-Level) ---")
    start_time = time.perf_counter()
    ttft = None
    accumulated_text = []

    try:
        with client.messages.create(
            model=MODEL,
            max_tokens=256,
            stream=True,
            messages=[
                {
                    "role": "user",
                    "content": "Explain SSE streaming in one concise paragraph under 50 words.",
                }
            ],
        ) as stream:
            for event in stream:
                event_type = event.type

                if event_type == "message_start":
                    msg = event.message
                    print(f"[{event_type}] ID: {msg.id}, Model: {msg.model}, Role: {msg.role}")
                    print(f"  Input tokens: {msg.usage.input_tokens}")

                elif event_type == "content_block_start":
                    print(f"[{event_type}] Index: {event.index}, Block Type: {event.content_block.type}")

                elif event_type == "content_block_delta":
                    if ttft is None:
                        ttft = (time.perf_counter() - start_time) * 1000
                        print(f"  --> Time to First Token (TTFT): {ttft:.1f}ms")
                    
                    delta = event.delta
                    if delta.type == "text_delta":
                        sys.stdout.write(delta.text)
                        sys.stdout.flush()
                        accumulated_text.append(delta.text)
                    elif delta.type == "input_json_delta":
                        print(f"  [Tool JSON Delta]: {delta.partial_json}")

                elif event_type == "content_block_stop":
                    print(f"\n[{event_type}] Block index {event.index} completed.")

                elif event_type == "message_delta":
                    delta_info = event.delta
                    usage_info = event.usage
                    print(f"[{event_type}] Stop reason: {delta_info.stop_reason}")
                    print(f"  Output tokens: {usage_info.output_tokens}")

                elif event_type == "message_stop":
                    total_ms = (time.perf_counter() - start_time) * 1000
                    print(f"[{event_type}] Stream closed cleanly in {total_ms:.1f}ms.")

                elif event_type == "ping":
                    print(f"[{event_type}] Keep-alive heartbeat received.")

    except RateLimitError as e:
        print(f"Rate limit exceeded: {e}", file=sys.stderr)
        raise
    except APIConnectionError as e:
        print(f"Network connection failed: {e}", file=sys.stderr)
        raise
    except APIStatusError as e:
        print(f"Anthropic API returned error status {e.status_code}: {e.message}", file=sys.stderr)
        raise


def demonstrate_stream_helper(client: Anthropic) -> None:
    """
    Demonstrates the recommended client.messages.stream() context manager.
    Provides ergonomic text iteration and access to the final assembled Message object.
    """
    print("\n--- 2. High-Level Stream Helper (client.messages.stream) ---")
    start_time = time.perf_counter()
    ttft = None

    try:
        with client.messages.stream(
            model=MODEL,
            max_tokens=256,
            messages=[
                {
                    "role": "user",
                    "content": "List three operational advantages of streaming over buffered JSON responses.",
                }
            ],
        ) as stream:
            for text_chunk in stream.text_stream:
                if ttft is None:
                    ttft = (time.perf_counter() - start_time) * 1000
                    print(f"[TTFT: {ttft:.1f}ms] Output stream:")
                sys.stdout.write(text_chunk)
                sys.stdout.flush()

            # Retrieve final assembled message object with accurate token usage
            final_message = stream.get_final_message()
            print("\n")
            print("--- Final Assembled Message Metadata ---")
            print(f"Message ID:   {final_message.id}")
            print(f"Stop Reason:  {final_message.stop_reason}")
            print(f"Input Tokens: {final_message.usage.input_tokens}")
            print(f"Output Tokens:{final_message.usage.output_tokens}")

    except Exception as e:
        print(f"Error during stream helper execution: {e}", file=sys.stderr)
        raise


def main() -> None:
    print(f"Connecting to Anthropic API with model: {MODEL}")
    client = Anthropic(api_key=API_KEY)

    # 1. Execute raw event stream
    demonstrate_raw_stream(client)

    # 2. Execute high-level stream helper
    demonstrate_stream_helper(client)


if __name__ == "__main__":
    main()
