#!/usr/bin/env bash
# ==============================================================================
# Anthropic Messages API: Forced Tool Choice for JSON Schema Enforcement Probe
# Sends a strict JSON Schema definition via the tools parameter and forces
# Claude to invoke the extraction tool deterministically via tool_choice.
# ==============================================================================

set -euo pipefail

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  if [ -f ".env" ]; then
    # shellcheck disable=SC1091
    export "$(grep -v '^#' .env | xargs)"
  fi
fi

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "Error: ANTHROPIC_API_KEY environment variable is not set." >&2
  echo "Usage: export ANTHROPIC_API_KEY=\"sk-ant-...\" && ./curl_probe.sh" >&2
  exit 1
fi

API_URL="https://api.anthropic.com/v1/messages"
MODEL="claude-3-7-sonnet-20250219"

echo "==> Probing Anthropic Messages API Structured Output via Forced Tool Choice..."
echo "Target Model: ${MODEL}"

PAYLOAD=$(cat <<'JSON'
{
  "model": "claude-3-7-sonnet-20250219",
  "max_tokens": 1024,
  "temperature": 0.0,
  "tools": [
    {
      "name": "extract_customer_order",
      "description": "Extract structured customer order details matching strict database specifications.",
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
              "additionalProperties": false
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
        "additionalProperties": false
      }
    }
  ],
  "tool_choice": {
    "type": "tool",
    "name": "extract_customer_order"
  },
  "messages": [
    {
      "role": "user",
      "content": "Process this transaction log: Customer alex.rivera@example.com placed order ORD-84920 for 2 units of SKU-SSD-2TB at $119.50 each and 1 unit of SKU-CABLE-TB4 at $29.00. Express shipping was selected. Calculate the total."
    }
  ]
}
JSON
)

START_TIME=$(date +%s%N)

RESPONSE=$(curl -s -w "\n%{http_code}\n%{time_total}" \
  -X POST "${API_URL}" \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d "${PAYLOAD}")

TOTAL_TIME=$(echo "${RESPONSE}" | tail -n 1)
HTTP_STATUS=$(echo "${RESPONSE}" | tail -n 2 | head -n 1)
BODY=$(echo "${RESPONSE}" | sed '$d' | sed '$d')

if [ "${HTTP_STATUS}" -ne 200 ]; then
  echo "Probe failed with HTTP Status: ${HTTP_STATUS}" >&2
  echo "Response Body: ${BODY}" >&2
  exit 1
fi

echo "HTTP Status: ${HTTP_STATUS} (OK)"
echo "Roundtrip Time: ${TOTAL_TIME}s"
echo "--- Extracted Structured Tool Call ---"
echo "${BODY}" | jq '.content[] | select(.type=="tool_use")' || echo "${BODY}"
echo "--------------------------------------"
echo "Probe completed successfully."
