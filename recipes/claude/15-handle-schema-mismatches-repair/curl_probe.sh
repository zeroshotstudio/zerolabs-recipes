#!/usr/bin/env bash
# ==============================================================================
# Executable cURL Probe: Schema Mismatch Feedback and Self-Correction Loop
# Tests sending a malformed output back to Claude with schema validation errors.
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

echo "=== Step 1: Initial Prompt Asking for Structured Output ==="
INITIAL_PAYLOAD=$(cat <<EOF
{
  "model": "$MODEL",
  "max_tokens": 1024,
  "system": "You extract server deployment records. Emit valid JSON matching schema: {\\\"service_name\\\": string, \\\"port\\\": integer (1-65535), \\\"status\\\": \\\"healthy\\\" | \\\"degraded\\\" | \\\"stopped\\\", \\\"tags\\\": list of strings}. Output JSON only.",
  "messages": [
    {
      "role": "user",
      "content": "Extract server details: 'auth-gateway is running on port 8080 with tags security, oauth, v2, currently healthy.'"
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

echo "Initial Response:"
echo "$RESPONSE_1" | jq -r '.content[0].text // .error.message'
echo ""

echo "=== Step 2: Simulating Schema Repair Loop Turn ==="
echo "Constructing multi-turn conversation with deliberate schema error feedback..."

REPAIR_PAYLOAD=$(cat <<EOF
{
  "model": "$MODEL",
  "max_tokens": 1024,
  "system": "You extract server deployment records. Emit valid JSON matching schema: {\\\"service_name\\\": string, \\\"port\\\": integer (1-65535), \\\"status\\\": \\\"healthy\\\" | \\\"degraded\\\" | \\\"stopped\\\", \\\"tags\\\": list of strings}. Output JSON only.",
  "messages": [
    {
      "role": "user",
      "content": "Extract server details: 'auth-gateway is running on port 8080 with tags security, oauth, v2, currently healthy.'"
    },
    {
      "role": "assistant",
      "content": "{\n  \"name\": \"auth-gateway\",\n  \"port\": \"8080\",\n  \"status\": \"active\"\n}"
    },
    {
      "role": "user",
      "content": "Schema validation failed with 3 errors:\\n1. Field 'service_name' is missing.\\n2. Field 'port' has invalid type: expected integer, received string '8080'.\\n3. Field 'status' value 'active' is not permitted. Permitted values are ['healthy', 'degraded', 'stopped'].\\n4. Missing required field 'tags'.\\n\\nPlease output the corrected JSON adhering strictly to the schema."
    }
  ]
}
EOF
)

REPAIR_RESPONSE=$(curl -sS "$ENDPOINT" \
  -H "x-api-key: $API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d "$REPAIR_PAYLOAD")

echo "Corrected Response from Claude:"
echo "$REPAIR_RESPONSE" | jq -r '.content[0].text // .error.message'
echo ""
echo "cURL schema mismatch repair probe completed successfully."
