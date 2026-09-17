#!/usr/bin/env bash
# ==============================================================================
# Executable cURL Probe: Parallel Tool Execution and Result Dispatch
# Demonstrates multi-turn tool calling with Claude Messages API.
# 1. Sends a prompt triggering multiple parallel tool invocations.
# 2. Inspects multiple tool_use blocks in the response.
# 3. Sends back corresponding tool_result blocks with matching tool_use_id values.
# ==============================================================================

set -euo pipefail

API_KEY="${ANTHROPIC_API_KEY:-}"
if [[ -z "$API_KEY" ]]; then
  echo "Error: ANTHROPIC_API_KEY environment variable is not set." >&2
  echo "Usage: ANTHROPIC_API_KEY=sk-ant-... ./curl_probe.sh" >&2
  exit 1
fi

MODEL="${ANTHROPIC_MODEL:-claude-3-7-sonnet-20250219}"
ENDPOINT="https://api.anthropic.com/v1/messages"

echo "=== Step 1: Prompt Claude with multiple tool definitions ==="

INITIAL_PAYLOAD=$(cat <<EOF
{
  "model": "$MODEL",
  "max_tokens": 1024,
  "tools": [
    {
      "name": "fetch_stock_quote",
      "description": "Retrieve current price and volume metrics for a stock ticker symbol.",
      "input_schema": {
        "type": "object",
        "properties": {
          "symbol": {
            "type": "string",
            "description": "Stock ticker symbol, e.g. AAPL, MSFT"
          }
        },
        "required": ["symbol"]
      }
    },
    {
      "name": "fetch_weather",
      "description": "Get real-time weather conditions for a specified city.",
      "input_schema": {
        "type": "object",
        "properties": {
          "city": {
            "type": "string",
            "description": "City name, e.g. Tokyo, London, San Francisco"
          }
        },
        "required": ["city"]
      }
    }
  ],
  "messages": [
    {
      "role": "user",
      "content": "Check the stock price for AAPL and the current weather in Tokyo."
    }
  ]
}
EOF
)

RESPONSE_1=$(curl -sS "$ENDPOINT" \
  -H "x-api-key: $API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d "$INITIAL_PAYLOAD")

STOP_REASON=$(echo "$RESPONSE_1" | jq -r '.stop_reason // empty')
echo "Initial Response Stop Reason: $STOP_REASON"

# Extract tool use blocks count
TOOL_COUNT=$(echo "$RESPONSE_1" | jq '[.content[] | select(.type == "tool_use")] | length')
echo "Detected $TOOL_COUNT parallel tool_use block(s) in response."

if [[ "$TOOL_COUNT" -eq 0 ]]; then
  echo "No tool_use blocks received. Claude response:"
  echo "$RESPONSE_1" | jq -r '.content[0].text // .error.message'
  exit 0
fi

# Print out extracted tool calls
echo "$RESPONSE_1" | jq -r '.content[] | select(.type == "tool_use") | "  - Tool: \(.name) [ID: \(.id)] Input: \(.input)"'

echo ""
echo "=== Step 2: Extracting tool_use IDs and synthesizing simulated results ==="

# Build assistant content array directly from response_1 content
ASSISTANT_CONTENT=$(echo "$RESPONSE_1" | jq '.content')

# Generate tool_result blocks for each tool_use block
TOOL_RESULTS=$(echo "$RESPONSE_1" | jq '
  [.content[] | select(.type == "tool_use") | 
    if .name == "fetch_stock_quote" then
      {
        type: "tool_result",
        tool_use_id: .id,
        content: "{\"symbol\": \"AAPL\", \"price\": 224.23, \"currency\": \"USD\", \"change\": \"+1.45%\"}"
      }
    elif .name == "fetch_weather" then
      {
        type: "tool_result",
        tool_use_id: .id,
        content: "{\"city\": \"Tokyo\", \"temp_c\": 21.0, \"condition\": \"Clear\", \"humidity\": \"55%\"}"
      }
    else
      {
        type: "tool_result",
        tool_use_id: .id,
        content: "{\"error\": \"Tool not found\"}",
        is_error: true
      }
    end
  ]
')

echo "Generated Tool Results:"
echo "$TOOL_RESULTS" | jq .

echo ""
echo "=== Step 3: Sending tool_result blocks back in turn 2 ==="

SECOND_PAYLOAD=$(jq -n \
  --arg model "$MODEL" \
  --argjson tools "$INITIAL_PAYLOAD" \
  --argjson assistant_content "$ASSISTANT_CONTENT" \
  --argjson tool_results "$TOOL_RESULTS" \
  '{
    model: $model,
    max_tokens: 1024,
    tools: $tools.tools,
    messages: [
      {
        role: "user",
        content: "Check the stock price for AAPL and the current weather in Tokyo."
      },
      {
        role: "assistant",
        content: $assistant_content
      },
      {
        role: "user",
        content: $tool_results
      }
    ]
  }'
)

RESPONSE_2=$(curl -sS "$ENDPOINT" \
  -H "x-api-key: $API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d "$SECOND_PAYLOAD")

FINAL_STOP_REASON=$(echo "$RESPONSE_2" | jq -r '.stop_reason // empty')
echo "Final Response Stop Reason: $FINAL_STOP_REASON"
echo ""
echo "=== Final Claude Synthesis ==="
echo "$RESPONSE_2" | jq -r '.content[] | select(.type == "text") | .text'
echo ""
echo "cURL parallel tool execution probe completed successfully."
