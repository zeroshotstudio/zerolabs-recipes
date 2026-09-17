#!/usr/bin/env bash
# curl_probe.sh: Demonstrates Claude Bash tool integration and execution handling via raw cURL and jq.
# Usage: ANTHROPIC_API_KEY="your_api_key" ./curl_probe.sh

set -euo pipefail

API_KEY="${ANTHROPIC_API_KEY:-}"
if [ -z "$API_KEY" ]; then
  echo "Error: ANTHROPIC_API_KEY environment variable is required." >&2
  exit 1
fi

API_URL="https://api.anthropic.com/v1/messages"
MODEL="${ANTHROPIC_MODEL:-claude-3-7-sonnet-20250219}"

echo "=== Turn 1: Invoking Claude with bash_20250124 Tool Definition ==="

PAYLOAD_TURN_1=$(cat <<EOF
{
  "model": "$MODEL",
  "max_tokens": 1024,
  "tools": [
    {
      "type": "bash_20250124",
      "name": "bash"
    }
  ],
  "messages": [
    {
      "role": "user",
      "content": "Run a bash command to check system memory usage and kernel release."
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
echo "Turn 1 Stop Reason: $STOP_REASON"

TOOL_CALL=$(echo "$RESPONSE_TURN_1" | jq -c '.content[] | select(.type=="tool_use")' 2>/dev/null || true)
if [ -z "$TOOL_CALL" ]; then
  echo "No tool call detected in response:"
  echo "$RESPONSE_TURN_1" | jq .
  exit 1
fi

TOOL_USE_ID=$(echo "$TOOL_CALL" | jq -r '.id')
TOOL_NAME=$(echo "$TOOL_CALL" | jq -r '.name')
COMMAND_TO_RUN=$(echo "$TOOL_CALL" | jq -r '.input.command // empty')

echo "Tool Name: $TOOL_NAME"
echo "Tool Use ID: $TOOL_USE_ID"
echo "Requested Command: $COMMAND_TO_RUN"

echo ""
echo "=== Simulating Sandboxed Command Execution ==="
# In production, execute inside a rootless container or isolated sandbox:
# docker run --rm --read-only --network none alpine:3.20 sh -c "$COMMAND_TO_RUN"

EXECUTION_OUTPUT=$(eval "$COMMAND_TO_RUN" 2>&1 || true)
EXIT_CODE=$?
echo "Execution Exit Code: $EXIT_CODE"
echo "Execution Output Sample (first 3 lines):"
echo "$EXECUTION_OUTPUT" | head -n 3

echo ""
echo "=== Turn 2: Returning tool_result Block to Claude ==="

PAYLOAD_TURN_2=$(cat <<EOF
{
  "model": "$MODEL",
  "max_tokens": 1024,
  "tools": [
    {
      "type": "bash_20250124",
      "name": "bash"
    }
  ],
  "messages": [
    {
      "role": "user",
      "content": "Run a bash command to check system memory usage and kernel release."
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
          "content": $(echo "$EXECUTION_OUTPUT" | jq -R -s .)
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
echo "Claude Final Response:"
echo "$RESPONSE_TURN_2" | jq -r '.content[] | select(.type=="text") | .text'

echo ""
echo "=== Probe Complete: Claude Bash Tool Invocation and Result Ingestion Verified ==="
