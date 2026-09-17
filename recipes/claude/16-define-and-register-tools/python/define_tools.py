"""
Claude Messages API Tool Definition, Registration, and Parsing Example.
Demonstrates schema declarations, tool_choice variants, and block inspection.
"""

import json
import os
from typing import Any, Dict, List, Optional
from anthropic import Anthropic
from anthropic.types import ToolParam, ToolChoiceAutoParam, ToolChoiceAnyParam, ToolChoiceToolParam


def get_order_tools() -> List[ToolParam]:
    """Define JSON schema tool definitions for customer order processing."""
    return [
        {
            "name": "lookup_order",
            "description": "Fetch shipping status, item line items, and fulfillment history for a customer order by ID.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "order_id": {
                        "type": "string",
                        "description": "The alphanumeric order identifier (e.g., ORD-94821)."
                    },
                    "include_history": {
                        "type": "boolean",
                        "description": "Whether to return full timeline audit events."
                    }
                },
                "required": ["order_id"]
            }
        },
        {
            "name": "cancel_order",
            "description": "Trigger an order cancellation and initiate an automated refund workflow.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "order_id": {
                        "type": "string",
                        "description": "The unique order ID to cancel."
                    },
                    "reason": {
                        "type": "string",
                        "enum": ["customer_request", "fraud_detected", "inventory_shortage", "duplicate_order"],
                        "description": "The categorized reason code for the cancellation."
                    },
                    "notify_customer": {
                        "type": "boolean",
                        "description": "Whether to dispatch an email notification to the purchaser."
                    }
                },
                "required": ["order_id", "reason"]
            }
        }
    ]


def parse_model_response(response) -> Dict[str, Any]:
    """
    Parse a Messages API response, categorizing text thoughts and tool invocations.
    Extracts block id, tool name, and parsed input dictionary.
    """
    result = {
        "stop_reason": response.stop_reason,
        "text_blocks": [],
        "tool_calls": []
    }

    for block in response.content:
        if block.type == "text":
            result["text_blocks"].append(block.text)
        elif block.type == "tool_use":
            result["tool_calls"].append({
                "id": block.id,
                "name": block.name,
                "input": block.input
            })

    return result


def demonstrate_tool_choice_modes(client: Optional[Anthropic] = None) -> None:
    """Execute queries comparing 'auto', 'any', and forced tool selection."""
    if client is None:
        client = Anthropic()

    tools = get_order_tools()
    model = os.getenv("ANTHROPIC_MODEL", "claude-3-7-sonnet-20250219")

    # Mode 1: tool_choice = {"type": "auto"}
    print("--- 1. Testing tool_choice: auto ---")
    resp_auto = client.messages.create(
        model=model,
        max_tokens=1024,
        tools=tools,
        tool_choice={"type": "auto"},
        messages=[
            {"role": "user", "content": "Can you check the current status of order ORD-44910?"}
        ]
    )
    parsed_auto = parse_model_response(resp_auto)
    print(f"Stop Reason: {parsed_auto['stop_reason']}")
    for call in parsed_auto["tool_calls"]:
        print(f"  Tool Use Block: ID={call['id']} | Name={call['name']} | Input={call['input']}")

    # Mode 2: tool_choice = {"type": "tool", "name": "cancel_order"}
    print("\n--- 2. Testing tool_choice: specific tool (cancel_order) ---")
    resp_forced = client.messages.create(
        model=model,
        max_tokens=1024,
        tools=tools,
        tool_choice={"type": "tool", "name": "cancel_order"},
        messages=[
            {"role": "user", "content": "The client wants to void order ORD-99120 immediately because they ordered twice."}
        ]
    )
    parsed_forced = parse_model_response(resp_forced)
    print(f"Stop Reason: {parsed_forced['stop_reason']}")
    for call in parsed_forced["tool_calls"]:
        print(f"  Tool Use Block: ID={call['id']} | Name={call['name']} | Input={call['input']}")

    # Mode 3: tool_choice = {"type": "any"}
    print("\n--- 3. Testing tool_choice: any ---")
    resp_any = client.messages.create(
        model=model,
        max_tokens=1024,
        tools=tools,
        tool_choice={"type": "any"},
        messages=[
            {"role": "user", "content": "Process ticket for account ACCT-12."}
        ]
    )
    parsed_any = parse_model_response(resp_any)
    print(f"Stop Reason: {parsed_any['stop_reason']}")
    for call in parsed_any["tool_calls"]:
        print(f"  Tool Use Block: ID={call['id']} | Name={call['name']} | Input={call['input']}")


if __name__ == "__main__":
    if not os.getenv("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY is not set. Please set the environment variable to run live calls.")
    else:
        demonstrate_tool_choice_modes()
