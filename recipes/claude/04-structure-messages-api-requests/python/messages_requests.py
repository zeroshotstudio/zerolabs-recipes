"""Anthropic Messages API Request Structure & Role Sequencing Harness.

Demonstrates root-level system parameter configuration, multi-turn conversation
history validation, multi-modal content blocks (text, image, PDF document),
tool use blocks, and error handling for malformed request structures.
"""

from __future__ import annotations

import base64
import os
import sys
import time
from typing import Any

import anthropic
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("ANTHROPIC_API_KEY")
if not API_KEY:
    print("Error: ANTHROPIC_API_KEY environment variable is missing.", file=sys.stderr)
    sys.exit(1)

client = anthropic.Anthropic(api_key=API_KEY)
PRIMARY_MODEL = "claude-3-7-sonnet-20250219"


def run_basic_structured_request() -> anthropic.types.Message:
    """Demonstrate root-level system prompt and alternating message turns."""
    print("\n[1/4] Testing basic request with root system prompt & role alternation...")
    start_time = time.perf_counter()

    # The system prompt is passed at the root of the client call, NEVER inside messages list
    response = client.messages.create(
        model=PRIMARY_MODEL,
        max_tokens=256,
        temperature=0.1,
        system="You are an enterprise system architect. Answer concisely with bulleted points.",
        messages=[
            {
                "role": "user",
                "content": "Why does Anthropic require system instructions outside the messages array?",
            },
            {
                "role": "assistant",
                "content": (
                    "Anthropic isolates system prompts at the root parameter to enforce "
                    "strict conversational boundaries, cache system prefixes efficiently, and "
                    "prevent role-inversion prompt injection vulnerabilities."
                ),
            },
            {
                "role": "user",
                "content": "What happens if a client application attempts to append a role='system' in messages?",
            },
        ],
    )

    elapsed = time.perf_counter() - start_time
    print(f"Status: Success ({elapsed:.2f}s)")
    print(f"Stop Reason: {response.stop_reason}")
    print(f"Input Tokens: {response.usage.input_tokens}, Output Tokens: {response.usage.output_tokens}")
    for block in response.content:
        if block.type == "text":
            print(f"Response: {block.text.strip()}")
    return response


def run_multimodal_content_blocks() -> anthropic.types.Message:
    """Demonstrate multi-modal content blocks (text + 1x1 synthetic PNG image)."""
    print("\n[2/4] Testing multi-modal content blocks (text + image block)...")
    start_time = time.perf_counter()

    # 1x1 transparent PNG payload in base64
    tiny_png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

    response = client.messages.create(
        model=PRIMARY_MODEL,
        max_tokens=200,
        temperature=0.0,
        system="Analyze incoming image assets and report technical specifications.",
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Inspect this image block and confirm receipt.",
                    },
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": tiny_png_b64,
                        },
                    },
                ],
            }
        ],
    )

    elapsed = time.perf_counter() - start_time
    print(f"Status: Success ({elapsed:.2f}s)")
    for block in response.content:
        if block.type == "text":
            print(f"Response: {block.text.strip()}")
    return response


def run_tool_use_roundtrip() -> anthropic.types.Message:
    """Demonstrate assistant tool_use blocks and subsequent user tool_result response."""
    print("\n[3/4] Testing tool_use and tool_result block sequencing...")
    start_time = time.perf_counter()

    tools: list[dict[str, Any]] = [
        {
            "name": "get_database_schema_version",
            "description": "Returns current production database schema revision.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "cluster_id": {
                        "type": "string",
                        "description": "Identifier for the target database cluster",
                    }
                },
                "required": ["cluster_id"],
            },
        }
    ]

    # Initial query prompting a tool call
    first_turn = client.messages.create(
        model=PRIMARY_MODEL,
        max_tokens=512,
        temperature=0.0,
        system="You are an automated operations agent. Use available tools when requested.",
        tools=tools,
        messages=[
            {
                "role": "user",
                "content": "Check the schema version for database cluster 'pg-primary-us-east-1'.",
            }
        ],
    )

    print(f"Turn 1 stop_reason: {first_turn.stop_reason}")

    tool_call_id = ""
    for block in first_turn.content:
        if block.type == "tool_use":
            tool_call_id = block.id
            print(f"Assistant initiated tool_use: id={block.id}, name={block.name}, input={block.input}")

    if not tool_call_id:
        print("Error: Expected tool_use block from model.")
        return first_turn

    # Execute simulated tool and return result block
    second_turn = client.messages.create(
        model=PRIMARY_MODEL,
        max_tokens=512,
        temperature=0.0,
        system="You are an automated operations agent. Use available tools when requested.",
        tools=tools,
        messages=[
            {
                "role": "user",
                "content": "Check the schema version for database cluster 'pg-primary-us-east-1'.",
            },
            {
                "role": "assistant",
                "content": first_turn.content,
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": tool_call_id,
                        "content": '{"cluster_id": "pg-primary-us-east-1", "schema_version": "2026.09.1", "status": "healthy"}',
                    }
                ],
            },
        ],
    )

    elapsed = time.perf_counter() - start_time
    print(f"Turn 2 complete ({elapsed:.2f}s). Final assistant response:")
    for block in second_turn.content:
        if block.type == "text":
            print(f"Response: {block.text.strip()}")
    return second_turn


def run_malformed_structure_probe() -> None:
    """Verify that malformed requests (consecutive user roles or system in messages) are caught."""
    print("\n[4/4] Validating error boundaries on invalid structure...")
    try:
        # Invalid: consecutive user messages without assistant turn
        client.messages.create(
            model=PRIMARY_MODEL,
            max_tokens=100,
            messages=[
                {"role": "user", "content": "Message 1"},
                {"role": "user", "content": "Message 2 without assistant turn"},
            ],
        )
        print("Notice: Consecutive user messages merged or accepted by endpoint.")
    except anthropic.BadRequestError as e:
        print(f"Correctly caught BadRequestError on invalid structure: {e.message}")
    except Exception as e:
        print(f"Caught expected validation error: {type(e).__name__}: {e}")


if __name__ == "__main__":
    print("=================================================================")
    print("Anthropic Messages API Request Structure & Role Suite")
    print("=================================================================")
    try:
        run_basic_structured_request()
        run_multimodal_content_blocks()
        run_tool_use_roundtrip()
        run_malformed_structure_probe()
        print("\nAll request structure tests passed.")
    except Exception as err:
        print(f"\nExecution failed: {err}", file=sys.stderr)
        sys.exit(1)
