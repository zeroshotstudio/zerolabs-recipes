#!/usr/bin/env bash
# ==============================================================================
# Anthropic Messages API Direct cURL Structure Probe
# Validates root-level system prompt, alternating user/assistant roles,
# and response token metrics without external SDK dependencies.
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

echo "==> Probing Anthropic Messages API Structure via cURL..."
echo "Target Model: ${MODEL}"

PAYLOAD=$(cat <<JSON
{
  "model": "${MODEL}",
  "max_tokens": 256,
  "temperature": 0.2,
  "system": "You are a deterministic technical validator. Reply concisely with strict JSON formatting.",
  "messages": [
    {
      "role": "user",
      "content": "Verify that your system prompt is applied at the root level and alternating message roles work as expected."
    },
    {
      "role": "assistant",
      "content": "{\"status\": \"acknowledged\", \"ready\": true}"
    },
    {
      "role": "user",
      "content": "Confirm current role sequence state."
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
echo "--- Response Content ---"
echo "${BODY}" | grep -o '"text": *"[^"]*"' || echo "${BODY}"
echo "------------------------"
echo "Probe completed successfully."
