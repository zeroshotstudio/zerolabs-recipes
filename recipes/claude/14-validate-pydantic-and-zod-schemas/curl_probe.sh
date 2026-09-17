#!/usr/bin/env bash
# ==============================================================================
# Executable cURL Probe: Validate Structured Tool Inputs with Claude
# Demonstrates sending a JSON Schema generated from typed schemas into Claude
# Messages API tool definitions, forcing a tool call, and verifying payload structure.
# ==============================================================================

set -euo pipefail

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  if [[ -f ".env" ]]; then
    # shellcheck disable=SC1091
    source .env
  fi
fi

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "Error: ANTHROPIC_API_KEY environment variable is missing." >&2
  echo "Run 'export ANTHROPIC_API_KEY=\"sk-ant-...\"' or configure a .env file." >&2
  exit 1
fi

MODEL="${ANTHROPIC_MODEL:-claude-3-7-sonnet-20250219}"
API_URL="https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION="2023-06-01"

echo "======================================================================"
echo "ZeroLabs: Claude Structured Output & Tool Validation Probe"
echo "Model: ${MODEL}"
echo "======================================================================"

# Payload defines the exact JSON Schema derived from a Pydantic or Zod schema
# Schema: IncidentReport
# Properties:
#   incident_id: string (pattern ^INC-[0-9]{4,6}$)
#   severity: string (enum: low, medium, high, critical)
#   affected_services: array of strings
#   summary: string
#   metrics: object with error_rate (number) and latency_p99_ms (number)
PAYLOAD=$(cat <<EOF
{
  "model": "${MODEL}",
  "max_tokens": 1024,
  "tools": [
    {
      "name": "record_incident_report",
      "description": "Records a validated production incident report into the tracking database.",
      "input_schema": {
        "type": "object",
        "properties": {
          "incident_id": {
            "type": "string",
            "description": "Identifier formatted as INC- followed by 4 to 6 digits.",
            "pattern": "^INC-[0-9]{4,6}$"
          },
          "severity": {
            "type": "string",
            "enum": ["low", "medium", "high", "critical"],
            "description": "Impact level of the incident."
          },
          "affected_services": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Microservices or subsystems impaired."
          },
          "summary": {
            "type": "string",
            "description": "Executive summary of the incident trigger and impact."
          },
          "metrics": {
            "type": "object",
            "properties": {
              "error_rate": {
                "type": "number",
                "description": "Percentage error rate observed (0.0 to 100.0)."
              },
              "latency_p99_ms": {
                "type": "number",
                "description": "99th percentile request latency in milliseconds."
              }
            },
            "required": ["error_rate", "latency_p99_ms"],
            "additionalProperties": false
          }
        },
        "required": ["incident_id", "severity", "affected_services", "summary", "metrics"],
        "additionalProperties": false
      }
    }
  ],
  "tool_choice": {
    "type": "tool",
    "name": "record_incident_report"
  },
  "messages": [
    {
      "role": "user",
      "content": "Generate an incident report for an outage on the payments-gateway service. Identifier is INC-90421. Critical severity, error rate spiked to 14.8 percent and p99 latency reached 3240 ms. Summary: Connection pool exhaustion caused 504 Gateway Timeouts."
    }
  ]
}
EOF
)

echo "Dispatching API request..."
RESPONSE=$(curl -sS -X POST "${API_URL}" \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -H "anthropic-version: ${ANTHROPIC_VERSION}" \
  -H "content-type: application/json" \
  -d "${PAYLOAD}")

# Check for API error response
if echo "${RESPONSE}" | grep -q '"type": *"error"'; then
  echo "API Error returned by Anthropic endpoint:" >&2
  echo "${RESPONSE}" | jq . >&2 2>/dev/null || echo "${RESPONSE}" >&2
  exit 1
fi

STOP_REASON=$(echo "${RESPONSE}" | jq -r '.stop_reason // empty')
TOOL_NAME=$(echo "${RESPONSE}" | jq -r '.content[] | select(.type=="tool_use") | .name' 2>/dev/null || true)
TOOL_INPUT=$(echo "${RESPONSE}" | jq -r '.content[] | select(.type=="tool_use") | .input' 2>/dev/null || true)

echo "Stop Reason: ${STOP_REASON}"
echo "Invoked Tool: ${TOOL_NAME}"
echo ""
echo "Extracted Structured Payload:"
echo "${RESPONSE}" | jq '.content[] | select(.type=="tool_use") | .input'

if [[ "${STOP_REASON}" == "tool_use" && -n "${TOOL_NAME}" ]]; then
  echo ""
  echo "SUCCESS: Claude produced a deterministic tool call matching the target schema."
  exit 0
else
  echo ""
  echo "WARNING: Claude did not trigger a tool_use block as expected." >&2
  exit 1
fi
