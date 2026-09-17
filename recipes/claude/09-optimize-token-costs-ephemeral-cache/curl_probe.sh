#!/usr/bin/env bash
# curl_probe.sh: Test Anthropic Messages API prompt caching lifetime, write, and read behavior
set -euo pipefail

API_URL="https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION="2023-06-01"
MODEL="claude-3-5-sonnet-20241022"

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "ERROR: ANTHROPIC_API_KEY environment variable is not set." >&2
  exit 1
fi

echo "================================================================="
echo "Claude Prompt Caching Economics & Cache Renewal Probe"
echo "Target Model: ${MODEL}"
echo "================================================================="

# Generate a repetitive context prefix (>1024 tokens) to satisfy Sonnet cache minimum
LARGE_PREFIX=$(python3 -c '
text = "The quick brown fox jumps over the lazy dog. Production systems require deterministic token management and latency tracking. " * 50
print(text.strip())
')

PAYLOAD=$(python3 -c '
import json, sys
prefix = sys.argv[1]
body = {
    "model": "'"${MODEL}"'",
    "max_tokens": 50,
    "system": [
        {
            "type": "text",
            "text": prefix,
            "cache_control": {"type": "ephemeral"}
        }
    ],
    "messages": [
        {"role": "user", "content": "Confirm that the knowledge base prefix was received."}
    ]
}
print(json.dumps(body))
' "${LARGE_PREFIX}")

echo ""
echo "--- Turn 1: Initial Request (Expected: Cache Creation / Write) ---"
RESP_1=$(curl -s -w "\nHTTP_STATUS:%{http_code}\nTIME_TOTAL:%{time_total}s\n" \
  -X POST "${API_URL}" \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -H "anthropic-version: ${ANTHROPIC_VERSION}" \
  -H "anthropic-beta: prompt-caching-2024-07-31" \
  -H "content-type: application/json" \
  -d "${PAYLOAD}")

STATUS_1=$(echo "${RESP_1}" | grep "HTTP_STATUS:" | cut -d':' -f2)
TIME_1=$(echo "${RESP_1}" | grep "TIME_TOTAL:" | cut -d':' -f2)
BODY_1=$(echo "${RESP_1}" | sed '/HTTP_STATUS:/d' | sed '/TIME_TOTAL:/d')

if [[ "${STATUS_1}" != "200" ]]; then
  echo "Turn 1 probe failed with HTTP status ${STATUS_1}:"
  echo "${BODY_1}"
  exit 1
fi

echo "Turn 1 HTTP Status: ${STATUS_1} | Elapsed: ${TIME_1}"
python3 -c '
import sys, json
data = json.loads(sys.stdin.read())
usage = data.get("usage", {})
print(f"  Input Tokens: {usage.get(\"input_tokens\", 0)}")
print(f"  Cache Creation Input Tokens: {usage.get(\"cache_creation_input_tokens\", 0)}")
print(f"  Cache Read Input Tokens: {usage.get(\"cache_read_input_tokens\", 0)}")
print(f"  Output Tokens: {usage.get(\"output_tokens\", 0)}")
' <<< "${BODY_1}"

echo ""
echo "Waiting 3 seconds to probe cache hit and lifetime refresh..."
sleep 3

echo ""
echo "--- Turn 2: Secondary Request (Expected: Cache Hit / Read) ---"
RESP_2=$(curl -s -w "\nHTTP_STATUS:%{http_code}\nTIME_TOTAL:%{time_total}s\n" \
  -X POST "${API_URL}" \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -H "anthropic-version: ${ANTHROPIC_VERSION}" \
  -H "anthropic-beta: prompt-caching-2024-07-31" \
  -H "content-type: application/json" \
  -d "${PAYLOAD}")

STATUS_2=$(echo "${RESP_2}" | grep "HTTP_STATUS:" | cut -d':' -f2)
TIME_2=$(echo "${RESP_2}" | grep "TIME_TOTAL:" | cut -d':' -f2)
BODY_2=$(echo "${RESP_2}" | sed '/HTTP_STATUS:/d' | sed '/TIME_TOTAL:/d')

if [[ "${STATUS_2}" != "200" ]]; then
  echo "Turn 2 probe failed with HTTP status ${STATUS_2}:"
  echo "${BODY_2}"
  exit 1
fi

echo "Turn 2 HTTP Status: ${STATUS_2} | Elapsed: ${TIME_2}"
python3 -c '
import sys, json
data = json.loads(sys.stdin.read())
usage = data.get("usage", {})
print(f"  Input Tokens: {usage.get(\"input_tokens\", 0)}")
print(f"  Cache Creation Input Tokens: {usage.get(\"cache_creation_input_tokens\", 0)}")
print(f"  Cache Read Input Tokens: {usage.get(\"cache_read_input_tokens\", 0)}")
print(f"  Output Tokens: {usage.get(\"output_tokens\", 0)}")
' <<< "${BODY_2}"

echo ""
echo "Probe evaluation complete. Cache hit reduces billable input token expense by 90%."
