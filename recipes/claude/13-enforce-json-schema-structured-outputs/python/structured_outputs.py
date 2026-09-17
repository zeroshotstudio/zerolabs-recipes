#!/usr/bin/env python3
"""
Anthropic Messages API: JSON Schema Enforcement via Forced Tool Calling
Demonstrates strict schema definitions, forced tool choice, Pydantic validation,
and reliable extraction of structured data from Claude tool_use content blocks.
"""

import json
import os
import sys
from typing import Any, Dict, List, Literal
from dotenv import load_dotenv
from pydantic import BaseModel, Field, ValidationError

try:
    import anthropic
except ImportError:
    print("Error: 'anthropic' package is required. Install via: pip install anthropic pydantic python-dotenv", file=sys.stderr)
    sys.exit(1)

load_dotenv()

# -----------------------------------------------------------------------------
# 1. Pydantic Domain Model for Python Validation
# -----------------------------------------------------------------------------
class OrderItem(BaseModel):
    sku: str = Field(description="Product SKU identifier")
    quantity: int = Field(ge=1, description="Quantity ordered")
    unit_price: float = Field(ge=0.0, description="Price per unit in USD")


class CustomerOrder(BaseModel):
    order_id: str = Field(description="Order identifier formatted as ORD-XXXXX")
    customer_email: str = Field(description="Valid customer email address")
    items: List[OrderItem] = Field(min_length=1, description="List of ordered catalog items")
    fulfillment_priority: Literal["standard", "express", "overnight"] = Field(
        description="Fulfillment speed tier"
    )
    total_amount: float = Field(ge=0.0, description="Sum total of order line items")


# -----------------------------------------------------------------------------
# 2. Strict JSON Schema Tool Definition
# -----------------------------------------------------------------------------
EXTRACTION_TOOL_NAME = "extract_customer_order"

CUSTOMER_ORDER_TOOL: Dict[str, Any] = {
    "name": EXTRACTION_TOOL_NAME,
    "description": "Extract fully validated customer order information conforming to the strict database schema.",
    "input_schema": {
        "type": "object",
        "properties": {
            "order_id": {
                "type": "string",
                "description": "Unique identifier formatted as ORD-XXXXX."
            },
            "customer_email": {
                "type": "string",
                "description": "Validated customer email address."
            },
            "items": {
                "type": "array",
                "description": "List of purchased catalog items.",
                "items": {
                    "type": "object",
                    "properties": {
                        "sku": {
                            "type": "string",
                            "description": "Product SKU code."
                        },
                        "quantity": {
                            "type": "integer",
                            "description": "Count of items purchased."
                        },
                        "unit_price": {
                            "type": "number",
                            "description": "Price per unit in USD."
                        }
                    },
                    "required": ["sku", "quantity", "unit_price"],
                    "additionalProperties": False
                }
            },
            "fulfillment_priority": {
                "type": "string",
                "enum": ["standard", "express", "overnight"],
                "description": "Shipping priority classification."
            },
            "total_amount": {
                "type": "number",
                "description": "Calculated total order amount."
            }
        },
        "required": ["order_id", "customer_email", "items", "fulfillment_priority", "total_amount"],
        "additionalProperties": False
    }
}


def extract_structured_order(unstructured_text: str) -> CustomerOrder:
    """
    Submits unstructured text to Claude Messages API with forced tool choice
    and validates the resulting tool_use block against the Pydantic schema.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY environment variable is not configured.")

    client = anthropic.Anthropic(api_key=api_key)

    print(f"[*] Dispatching Messages API request with forced tool_choice: {EXTRACTION_TOOL_NAME}...")
    response = client.messages.create(
        model="claude-3-7-sonnet-20250219",
        max_tokens=1024,
        temperature=0.0,
        tools=[CUSTOMER_ORDER_TOOL],
        tool_choice={"type": "tool", "name": EXTRACTION_TOOL_NAME},
        messages=[
            {
                "role": "user",
                "content": f"Extract structured order data from this transaction:\n\n{unstructured_text}"
            }
        ]
    )

    print(f"[+] Response stop_reason: {response.stop_reason}")
    print(f"[+] Token Usage -> Input: {response.usage.input_tokens}, Output: {response.usage.output_tokens}")

    # Inspect content blocks for tool_use
    tool_use_block = None
    for block in response.content:
        if block.type == "tool_use" and block.name == EXTRACTION_TOOL_NAME:
            tool_use_block = block
            break

    if not tool_use_block:
        raise RuntimeError(
            f"Expected tool_use block '{EXTRACTION_TOOL_NAME}' but none was returned. "
            f"Content blocks: {[b.type for b in response.content]}"
        )

    raw_payload = tool_use_block.input
    print(f"[+] Raw Tool Input Payload:\n{json.dumps(raw_payload, indent=2)}")

    # Strict Pydantic parsing and type coercion
    validated_order = CustomerOrder.model_validate(raw_payload)
    return validated_order


def main() -> None:
    sample_text = (
        "Customer confirmation: Order ORD-99341 was placed by dev-ops@zeroshot.studio. "
        "The customer bought 3 units of SKU-SRV-NVME at $249.99 each and 2 units of "
        "SKU-RAM-64GB at $180.00 each. Expedited overnight delivery requested. "
        "Total computed as $1109.97."
    )

    print("=" * 70)
    print("ZeroLabs Structured Output Enforcement Probe (Python)")
    print("=" * 70)

    try:
        order = extract_structured_order(sample_text)
        print("\n[SUCCESS] Successfully validated Pydantic model:")
        print(f"  Order ID:             {order.order_id}")
        print(f"  Customer:             {order.customer_email}")
        print(f"  Priority:             {order.fulfillment_priority}")
        print(f"  Line Items Count:     {len(order.items)}")
        for idx, item in enumerate(order.items, 1):
            print(f"    Item {idx}: SKU={item.sku}, Qty={item.quantity}, Price=${item.unit_price:.2f}")
        print(f"  Calculated Total:     ${order.total_amount:.2f}")

    except ValidationError as ve:
        print(f"[ERROR] Pydantic validation failed: {ve}", file=sys.stderr)
        sys.exit(1)
    except Exception as exc:
        print(f"[ERROR] Execution failed: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
