#!/usr/bin/env bash
# curl_probe.sh: Measure and debug Anthropic prompt cache hit rates across consecutive requests
set -euo pipefail

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "ERROR: ANTHROPIC_API_KEY environment variable is not set." >&2
  echo "Usage: export ANTHROPIC_API_KEY='sk-ant-api...' && ./curl_probe.sh" >&2
  exit 1
fi

API_URL="https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION="2023-06-01"
MODEL="claude-3-5-sonnet-20241022"

# Construct a static system prompt exceeding the 1,024 token caching threshold
BASE_PROMPT="You are an enterprise system architect verifying prompt cache behaviors. Below is reference documentation: "
PADDING=$(printf 'Cache benchmarking token payload block %04d. ' {1..260})
FULL_SYSTEM_PROMPT="${BASE_PROMPT} ${PADDING}"

echo "========================================================================"
echo "Probe 1: Initial Request (Cold Cache Write - Expected: cache_creation)"
echo "========================================================================"

PAYLOAD_CALL_1=$(cat <<JSON
{
  "model": "${MODEL}",
  "max_tokens": 100,
  "system": [
    {
      "type": "text",
      "text": "${FULL_SYSTEM_PROMPT}",
      "cache_control": {
        "type": "ephemeral"
      }
    }
  ],
  "messages": [
    {
      "role": "user",
      "content": "Acknowledge receipt of the architectural system document with one word: READY."
    }
  ]
}
JSON
)

RESP_1=$(curl -s -w "\nHTTP_STATUS:%{http_code}\nTIME_TOTAL:%{time_total}s\n" \
  -X POST "${API_URL}" \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -H "anthropic-version: ${ANTHROPIC_VERSION}" \
  -H "content-type: application/json" \
  -d "${PAYLOAD_CALL_1}")

HTTP_STATUS_1=$(echo "${RESP_1}" | grep "HTTP_STATUS:" | cut -d: -f2)
TIME_TOTAL_1=$(echo "${RESP_1}" | grep "TIME_TOTAL:" | cut -d: -f2)
BODY_1=$(echo "${RESP_1}" | grep -v "HTTP_STATUS:" | grep -v "TIME_TOTAL:")

echo "HTTP Status: ${HTTP_STATUS_1} (Elapsed: ${TIME_TOTAL_1})"
python3 -c "
import sys, json
try:
    data = json.loads(sys.argv[1])
    usage = data.get('usage', {})
    in_tok = usage.get('input_tokens', 0)
    created = usage.get('cache_creation_input_tokens', 0)
    read = usage.get('cache_read_input_tokens', 0)
    out_tok = usage.get('output_tokens', 0)
    print(f'Usage Breakdown:')
    print(f'  - regular input_tokens:         {in_tok}')
    print(f'  - cache_creation_input_tokens: {created}')
    print(f'  - cache_read_input_tokens:     {read}')
    print(f'  - output_tokens:               {out_tok}')
    if created > 0:
        print('PASS: Cold write successfully created cache entries.')
    else:
        print('NOTE: cache_creation_input_tokens was 0. Verify token count exceeds 1,024.')
except Exception as e:
    print(f'Failed to parse JSON response: {e}')
    print(sys.argv[1][:300])
" "${BODY_1}"

echo ""
echo "========================================================================"
echo "Probe 2: Consecutive Request (Warm Cache Read - Expected: cache_read)"
echo "========================================================================"

PAYLOAD_CALL_2=$(cat <<JSON
{
  "model": "${MODEL}",
  "max_tokens": 100,
  "system": [
    {
      "type": "text",
      "text": "${FULL_SYSTEM_PROMPT}",
      "cache_control": {
        "type": "ephemeral"
      }
    }
  ],
  "messages": [
    {
      "role": "user",
      "content": "Verify system status in three words."
    }
  ]
}
JSON
)

RESP_2=$(curl -s -w "\nHTTP_STATUS:%{http_code}\nTIME_TOTAL:%{time_total}s\n" \
  -X POST "${API_URL}" \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -H "anthropic-version: ${ANTHROPIC_VERSION}" \
  -H "content-type: application/json" \
  -d "${PAYLOAD_CALL_2}")

HTTP_STATUS_2=$(echo "${RESP_2}" | grep "HTTP_STATUS:" | cut -d: -f2)
TIME_TOTAL_2=$(echo "${RESP_2}" | grep "TIME_TOTAL:" | cut -d: -f2)
BODY_2=$(echo "${RESP_2}" | grep -v "HTTP_STATUS:" | grep -v "TIME_TOTAL:")

echo "HTTP Status: ${HTTP_STATUS_2} (Elapsed: ${TIME_TOTAL_2})"
python3 -c "
import sys, json
try:
    data = json.loads(sys.argv[1])
    usage = data.get('usage', {})
    in_tok = usage.get('input_tokens', 0)
    created = usage.get('cache_creation_input_tokens', 0)
    read = usage.get('cache_read_input_tokens', 0)
    out_tok = usage.get('output_tokens', 0)
    print(f'Usage Breakdown:')
    print(f'  - regular input_tokens:         {in_tok}')
    print(f'  - cache_creation_input_tokens: {created}')
    print(f'  - cache_read_input_tokens:     {read}')
    print(f'  - output_tokens:               {out_tok}')
    total_cached_context = in_tok + created + read
    if total_cached_context > 0:
        hit_rate = (read / total_cached_context) * 100
        print(f'Effective Cache Hit Rate: {hit_rate:.2f}%')
    if read > 0:
        print('PASS: Warm read successfully hit cached tokens.')
    else:
        print('WARNING: Cache read missed. Check for prefix mutation or TTL expiry.')
except Exception as e:
    print(f'Failed to parse JSON response: {e}')
    print(sys.argv[1][:300])
" "${BODY_2}"
