#!/usr/bin/env bash
# curl_probe.sh: Demonstrates Claude text editor tool integration using raw cURL and jq.
# Usage: ANTHROPIC_API_KEY="your_api_key" ./curl_probe.sh

set -euo pipefail

API_KEY="${ANTHROPIC_API_KEY:-}"
if [ -z "$API_KEY" ]; then
  echo "Error: ANTHROPIC_API_KEY environment variable is required." >&2
  exit 1
fi

API_URL="https://api.anthropic.com/v1/messages"
MODEL="${ANTHROPIC_MODEL:-claude-3-7-sonnet-20250219}"

echo "=== Turn 1: Requesting File Modification with Text Editor Tool ==="
PAYLOAD_TURN_1=$(cat <<EOF
{
  "model": "$MODEL",
  "max_tokens": 1024,
  "tools": [
    {
      "type": "text_editor_20250124",
      "name": "str_replace_editor"
    }
  ],
  "messages": [
    {
      "role": "user",
      "content": "In /workspace/config.py, change the port variable from 8080 to 9090."
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
COMMAND=$(echo "$TOOL_CALL" | jq -r '.input.command')
TARGET_PATH=$(echo "$TOOL_CALL" | jq -r '.input.path')

echo "Detected Tool Call: $TOOL_NAME (id: $TOOL_USE_ID)"
echo "Command: $COMMAND"
echo "Target Path: $TARGET_PATH"
echo "Full Tool Input:"
echo "$TOOL_CALL" | jq '.input'

echo ""
echo "=== Turn 2: Executing Tool Operation and Returning Tool Result ==="

# Claude typically views the file first or performs str_replace directly if context allows
if [ "$COMMAND" = "view" ]; then
  MOCK_RESULT="1: # Configuration\n2: HOST = \"0.0.0.0\"\n3: PORT = 8080\n4: DEBUG = False"
elif [ "$COMMAND" = "str_replace" ]; then
  OLD_STR=$(echo "$TOOL_CALL" | jq -r '.input.old_str')
  NEW_STR=$(echo "$TOOL_CALL" | jq -r '.input.new_str')
  MOCK_RESULT="Successfully replaced '$OLD_STR' with '$NEW_STR' in $TARGET_PATH."
else
  MOCK_RESULT="Command '$COMMAND' executed successfully."
fi

PAYLOAD_TURN_2=$(cat <<EOF
{
  "model": "$MODEL",
  "max_tokens": 1024,
  "tools": [
    {
      "type": "text_editor_20250124",
      "name": "str_replace_editor"
    }
  ],
  "messages": [
    {
      "role": "user",
      "content": "In /workspace/config.py, change the port variable from 8080 to 9090."
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
          "content": $(echo -e "$MOCK_RESULT" | jq -R -s .)
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

# Inspect assistant text or subsequent tool call
TEXT_RESPONSE=$(echo "$RESPONSE_TURN_2" | jq -r '.content[] | select(.type=="text") | .text' 2>/dev/null || true)
if [ -n "$TEXT_RESPONSE" ]; then
  echo "Assistant Response:"
  echo "$TEXT_RESPONSE"
fi

SUBSEQUENT_TOOL=$(echo "$RESPONSE_TURN_2" | jq -c '.content[] | select(.type=="tool_use")' 2>/dev/null || true)
if [ -n "$SUBSEQUENT_TOOL" ]; then
  echo "Subsequent Tool Call:"
  echo "$SUBSEQUENT_TOOL" | jq .
fi

echo ""
echo "=== Probe Complete: Text editor tool invocation verified ==="
