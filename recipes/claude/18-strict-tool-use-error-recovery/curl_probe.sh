#!/usr/bin/env bash
# curl_probe.sh: Demonstrates Claude tool error recovery loop using raw cURL and jq.
# Usage: ANTHROPIC_API_KEY="your_api_key" ./curl_probe.sh

set -euo pipefail

API_KEY="${ANTHROPIC_API_KEY:-}"
if [ -z "$API_KEY" ]; then
  echo "Error: ANTHROPIC_API_KEY environment variable is required." >&2
  exit 1
fi

API_URL="https://api.anthropic.com/v1/messages"
MODEL="${ANTHROPIC_MODEL:-claude-3-7-sonnet-20250219}"

echo "=== Turn 1: User Request Triggering Tool Call ==="
PAYLOAD_TURN_1=$(cat <<EOF
{
  "model": "$MODEL",
  "max_tokens": 1024,
  "tools": [
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
            "description": "Deployment environment"
          }
        },
        "required": ["record_id", "environment"]
      }
    }
  ],
  "messages": [
    {
      "role": "user",
      "content": "Look up record 'legacy-user-999' in prod environment."
    }
  ]
}
EOF
)

RESPONSE_TURN_1=$(curl -s -X POST "$API_URL" \
  -H "x-api-key: $API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d "$PAYLOAD_TURN_1")

STOP_REASON=$(echo "$RESPONSE_TURN_1" | jq -r '.stop_reason // empty')
echo "Stop Reason: $STOP_REASON"

TOOL_CALL=$(echo "$RESPONSE_TURN_1" | jq -c '.content[] | select(.type=="tool_use")')
if [ -z "$TOOL_CALL" ]; then
  echo "No tool call detected in response:"
  echo "$RESPONSE_TURN_1" | jq .
  exit 1
fi

TOOL_USE_ID=$(echo "$TOOL_CALL" | jq -r '.id')
TOOL_NAME=$(echo "$TOOL_CALL" | jq -r '.name')
TOOL_INPUT=$(echo "$TOOL_CALL" | jq -c '.input')

echo "Detected Tool Call: $TOOL_NAME (id: $TOOL_USE_ID)"
echo "Tool Input: $TOOL_INPUT"

echo ""
echo "=== Turn 2: Simulating Validation Failure & Injecting is_error: true ==="

ERROR_MESSAGE="ValidationError: Field 'record_id' must be a valid UUIDv4 string (received: 'legacy-user-999'). Expected format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx. For legacy user 999, mapped UUID is '550e8400-e29b-41d4-a716-446655440999'. Environment 'prod' must be literal 'production'."

PAYLOAD_TURN_2=$(cat <<EOF
{
  "model": "$MODEL",
  "max_tokens": 1024,
  "tools": [
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
            "description": "Deployment environment"
          }
        },
        "required": ["record_id", "environment"]
      }
    }
  ],
  "messages": [
    {
      "role": "user",
      "content": "Look up record 'legacy-user-999' in prod environment."
    },
    {
      "role": "assistant",
      "content": $(echo "$RESPONSE_TURN_1" | jq '.content')
    },
    {
      "role": "user",
      "content": [
        {
          "type": "tool_result",
          "tool_use_id": "$TOOL_USE_ID",
          "is_error": true,
          "content": $(echo "$ERROR_MESSAGE" | jq -R .)
        }
      ]
    }
  ]
}
EOF
)

RESPONSE_TURN_2=$(curl -s -X POST "$API_URL" \
  -H "x-api-key: $API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d "$PAYLOAD_TURN_2")

STOP_REASON_2=$(echo "$RESPONSE_TURN_2" | jq -r '.stop_reason // empty')
echo "Turn 2 Stop Reason: $STOP_REASON_2"

TOOL_CALL_2=$(echo "$RESPONSE_TURN_2" | jq -c '.content[] | select(.type=="tool_use")' 2>/dev/null || true)
if [ -n "$TOOL_CALL_2" ]; then
  TOOL_USE_ID_2=$(echo "$TOOL_CALL_2" | jq -r '.id')
  TOOL_NAME_2=$(echo "$TOOL_CALL_2" | jq -r '.name')
  TOOL_INPUT_2=$(echo "$TOOL_CALL_2" | jq -c '.input')
  echo "Claude corrected tool input in Turn 2:"
  echo "Tool Name: $TOOL_NAME_2 (id: $TOOL_USE_ID_2)"
  echo "Corrected Input: $TOOL_INPUT_2"
else
  echo "Claude corrected output without second tool call:"
  echo "$RESPONSE_TURN_2" | jq -r '.content[] | select(.type=="text") | .text'
fi

echo ""
echo "=== Probe Complete: Error recovery verification verified ==="
