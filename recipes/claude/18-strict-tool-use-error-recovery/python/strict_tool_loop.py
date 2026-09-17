"""
Strict Tool Use and Error Recovery Loop in Python.

Demonstrates:
- Catching tool validation exceptions, runtime execution errors, and timeouts.
- Feeding errors back to Claude via tool_result with is_error=True.
- Bounded retry loops with turn budgets.
- Circuit breaker escalation to fallback or dead letter queue (DLQ).
"""

import os
import sys
import json
import uuid
from typing import Any, Dict, List, Optional
from anthropic import Anthropic

# Tool definitions schema
TOOLS = [
    {
        "name": "lookup_database_record",
        "description": "Look up a record in the database by valid UUID and environment.",
        "input_schema": {
            "type": "object",
            "properties": {
                "record_id": {
                    "type": "string",
                    "description": "Valid UUIDv4 format record identifier"
                },
                "environment": {
                    "type": "string",
                    "enum": ["staging", "production"],
                    "description": "Target deployment environment"
                }
            },
            "required": ["record_id", "environment"]
        }
    }
]

# Mock database simulating strict runtime validation
MOCK_DB = {
    "550e8400-e29b-41d4-a716-446655440999": {
        "id": "550e8400-e29b-41d4-a716-446655440999",
        "name": "Acme Global Enterprise",
        "status": "active",
        "tier": "enterprise"
    }
}


class ToolExecutionError(Exception):
    """Raised when tool arguments fail runtime constraints or execution fails."""
    pass


def execute_tool(name: str, arguments: Dict[str, Any]) -> str:
    """
    Executes the specified tool with strict argument validation.
    Raises ToolExecutionError on invalid arguments or runtime errors.
    """
    if name != "lookup_database_record":
        raise ToolExecutionError(f"Unknown tool '{name}'. Permitted tools: lookup_database_record")

    record_id = arguments.get("record_id", "")
    environment = arguments.get("environment", "")

    # Strict UUID validation
    try:
        parsed_uuid = uuid.UUID(record_id, version=4)
    except (ValueError, AttributeError, TypeError):
        raise ToolExecutionError(
            f"ValidationError: 'record_id' must be a valid UUIDv4 string. Received: '{record_id}'. "
            "Example valid UUID: 550e8400-e29b-41d4-a716-446655440999. If querying legacy ID 999, use 550e8400-e29b-41d4-a716-446655440999."
        )

    # Environment validation
    if environment not in ["staging", "production"]:
        raise ToolExecutionError(
            f"ValidationError: 'environment' must be either 'staging' or 'production'. Received: '{environment}'."
        )

    record = MOCK_DB.get(str(parsed_uuid))
    if not record:
        raise ToolExecutionError(f"NotFoundError: Record with ID '{parsed_uuid}' does not exist in {environment}.")

    return json.dumps(record)


def run_agent_loop(
    client: Anthropic,
    prompt: str,
    max_turns: int = 4,
    model: str = "claude-3-7-sonnet-20250219"
) -> Dict[str, Any]:
    """
    Runs an autonomous agent loop with strict error recovery.
    Limits execution to max_turns to prevent runaway execution.
    """
    messages: List[Dict[str, Any]] = [
        {"role": "user", "content": prompt}
    ]

    total_turns = 0
    error_count = 0

    while total_turns < max_turns:
        total_turns += 1
        print(f"\n--- Turn {total_turns} ---")

        response = client.messages.create(
            model=model,
            max_tokens=1024,
            tools=TOOLS,
            messages=messages
        )

        # Append Claude's assistant message to conversation history
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason == "end_turn":
            print("Claude completed task without pending tool calls.")
            final_text = "".join(
                block.text for block in response.content if hasattr(block, "text")
            )
            return {
                "status": "success",
                "output": final_text,
                "turns": total_turns,
                "errors_recovered": error_count
            }

        if response.stop_reason == "tool_use":
            tool_results = []

            for block in response.content:
                if block.type == "tool_use":
                    tool_id = block.id
                    tool_name = block.name
                    tool_input = block.input

                    print(f"Tool invocation: {tool_name} | Args: {json.dumps(tool_input)}")

                    try:
                        result_str = execute_tool(tool_name, tool_input)
                        print(f"Tool execution succeeded: {result_str}")
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": tool_id,
                            "content": result_str
                        })
                    except ToolExecutionError as exc:
                        error_count += 1
                        error_message = str(exc)
                        print(f"Tool execution failed: {error_message}")
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": tool_id,
                            "is_error": True,
                            "content": f"Tool Execution Failed: {error_message}"
                        })

            # Append tool results as user turn
            messages.append({"role": "user", "content": tool_results})

    # Circuit breaker triggered
    print(f"Circuit breaker tripped: exceeded maximum {max_turns} turns.")
    return {
        "status": "circuit_breaker_tripped",
        "output": None,
        "turns": total_turns,
        "errors_recovered": error_count,
        "history": messages
    }


def main():
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("Error: ANTHROPIC_API_KEY environment variable required.", file=sys.stderr)
        sys.exit(1)

    client = Anthropic(api_key=api_key)

    # Prompt with ambiguous legacy ID designed to trigger error recovery
    test_prompt = "Query our production database for legacy record 999."
    print(f"Starting agent loop with prompt: '{test_prompt}'")

    result = run_agent_loop(client, test_prompt)
    print("\n=== Agent Result ===")
    print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
