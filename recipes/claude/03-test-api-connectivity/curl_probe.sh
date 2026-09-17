#!/usr/bin/env bash
set -euo pipefail

# Check for API key
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
  fi
fi

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "Error: ANTHROPIC_API_KEY environment variable is not set."
  echo "Usage: export ANTHROPIC_API_KEY=\"sk-ant-...\" && ./curl_probe.sh"
  exit 1
fi

echo "=== 1. Probing Models Endpoint (/v1/models) ==="
START_MODELS=$(date +%s%N)
MODELS_RESPONSE=$(curl -s -w "\n%{http_code}\n%{time_total}" -X GET "https://api.anthropic.com/v1/models" \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -H "anthropic-version: 2023-06-01")

TOTAL_TIME=$(echo "${MODELS_RESPONSE}" | tail -n 1)
HTTP_CODE=$(echo "${MODELS_RESPONSE}" | tail -n 2 | head -n 1)
BODY=$(echo "${MODELS_RESPONSE}" | head -n -2)

echo "HTTP Status: ${HTTP_CODE}"
echo "Total Latency: ${TOTAL_TIME}s"

if [ "${HTTP_CODE}" -eq 200 ]; then
  echo "Available Models:"
  echo "${BODY}" | grep -o '"id": *"[^"]*"' | head -n 5
else
  echo "Response Body:"
  echo "${BODY}"
fi

echo ""
echo "=== 2. Probing Latency Ping Message (/v1/messages) ==="
PING_RESPONSE=$(curl -s -w "\n%{http_code}\n%{time_total}" -X POST "https://api.anthropic.com/v1/messages" \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-3-5-haiku-20241022",
    "max_tokens": 1,
    "messages": [{"role": "user", "content": "ping"}]
  }')

PING_TOTAL_TIME=$(echo "${PING_RESPONSE}" | tail -n 1)
PING_HTTP_CODE=$(echo "${PING_RESPONSE}" | tail -n 2 | head -n 1)
PING_BODY=$(echo "${PING_RESPONSE}" | head -n -2)

echo "HTTP Status: ${PING_HTTP_CODE}"
echo "Roundtrip Latency: ${PING_TOTAL_TIME}s"
if [ "${PING_HTTP_CODE}" -eq 200 ]; then
  echo "Connectivity verified successfully."
else
  echo "Message probe failed with status ${PING_HTTP_CODE}:"
  echo "${PING_BODY}"
fi
