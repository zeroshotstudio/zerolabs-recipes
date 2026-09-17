#!/usr/bin/env bash
# ==============================================================================
# Executable cURL Probe: Tool Definition and Registration with Claude
# Demonstrates defining JSON schemas, setting tool_choice, and parsing tool_use.
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

echo "=== Test 1: Tool Registration with tool_choice = 'auto' ==="
AUTO_PAYLOAD=$(cat <<EOF
{
  "model": "$MODEL",
  "max_tokens": 1024,
  "tools": [
    {
      "name": "get_database_schema",
      "description": "Retrieve table columns, data types, and primary key definitions for a database table.",
      "input_schema": {
        "type": "object",
        "properties": {
          "table_name": {
            "type": "string",
            "description": "The exact name of the table to inspect."
          },
          "include_indexes": {
            "type": "boolean",
            "description": "Whether to return secondary indexes."
          }
        },
        "required": ["table_name"]
      }
    }
  ],
  "tool_choice": {
    "type": "auto"
  },
  "messages": [
    {
      "role": "user",
      "content": "Check the schema definition for the orders table."
    }
  ]
}
EOF
)

RESPONSE_AUTO=$(curl -sS "$ENDPOINT" \
  -H "x-api-key: $API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d "$AUTO_PAYLOAD")

echo "Stop Reason: $(echo "$RESPONSE_AUTO" | jq -r '.stop_reason // "error"')"
echo "Content Blocks:"
echo "$RESPONSE_AUTO" | jq -r '.content[] | if .type == "tool_use" then "Tool Call: \(.name) (id: \(.id)) -> \(.input)" elif .type == "text" then "Text: \(.text)" else "Other: \(.type)" end'
echo ""

echo "=== Test 2: Enforcing Specific Tool Execution (tool_choice = 'tool') ==="
FORCED_PAYLOAD=$(cat <<EOF
{
  "model": "$MODEL",
  "max_tokens": 1024,
  "tools": [
    {
      "name": "get_database_schema",
      "description": "Retrieve table columns, data types, and primary key definitions for a database table.",
      "input_schema": {
        "type": "object",
        "properties": {
          "table_name": {
            "type": "string",
            "description": "The exact name of the table to inspect."
          },
          "include_indexes": {
            "type": "boolean",
            "description": "Whether to return secondary indexes."
          }
        },
        "required": ["table_name"]
      }
    },
    {
      "name": "execute_read_query",
      "description": "Run a read-only SQL query against the database.",
      "input_schema": {
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "The SQL query to run."
          }
        },
        "required": ["query"]
      }
    }
  ],
  "tool_choice": {
    "type": "tool",
    "name": "get_database_schema"
  },
  "messages": [
    {
      "role": "user",
      "content": "Analyze user churn patterns across active accounts."
    }
  ]
}
EOF
)

RESPONSE_FORCED=$(curl -sS "$ENDPOINT" \
  -H "x-api-key: $API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d "$FORCED_PAYLOAD")

echo "Stop Reason: $(echo "$RESPONSE_FORCED" | jq -r '.stop_reason // "error"')"
echo "Enforced Tool Call:"
echo "$RESPONSE_FORCED" | jq -r '.content[] | select(.type == "tool_use") | "Invoked \(.name) with input: \(.input | tostring)"'
echo ""
echo "cURL probe completed successfully."
