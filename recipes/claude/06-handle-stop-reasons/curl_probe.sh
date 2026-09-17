#!/usr/bin/env bash
# curl_probe.sh — Probe Anthropic Messages API stop reasons & max_tokens cutoff
set -euo pipefail

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "ERROR: ANTHROPIC_API_KEY environment variable is not set." >&2
  echo "Usage: export ANTHROPIC_API_KEY='sk-ant-api...' && ./curl_probe.sh" >&2
  exit 1
fi

API_URL="https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION="2023-06-01"
MODEL="claude-3-5-sonnet-20241022"

echo "=== Probe 1: Testing max_tokens Truncation (Forced Cutoff) ==="
PAYLOAD_MAX_TOKENS=$(cat <<JSON
{
  "model": "${MODEL}",
  "max_tokens": 15,
  "messages": [
    {
      "role": "user",
      "content": "Write an extensive multi-paragraph explanation of distributed systems consensus algorithms."
    }
  ]
}
JSON
)

RESP_MAX_TOKENS=$(curl -s -w "\nHTTP_STATUS:%{http_code}\nTIME_TOTAL:%{time_total}s\n" \
  -X POST "${API_URL}" \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -H "anthropic-version: ${ANTHROPIC_VERSION}" \
  -H "content-type: application/json" \
  -d "${PAYLOAD_MAX_TOKENS}")

HTTP_STATUS_1=$(echo "${RESP_MAX_TOKENS}" | grep "HTTP_STATUS:" | cut -d: -f2)
TIME_TOTAL_1=$(echo "${RESP_MAX_TOKENS}" | grep "TIME_TOTAL:" | cut -d: -f2)
BODY_1=$(echo "${RESP_MAX_TOKENS}" | grep -v "HTTP_STATUS:" | grep -v "TIME_TOTAL:")

echo "HTTP Status: ${HTTP_STATUS_1} (${TIME_TOTAL_1})"
STOP_REASON_1=$(python3 -c "import sys, json; data=json.loads(sys.argv[1]); print(data.get('stop_reason', 'none'))" "${BODY_1}" 2>/dev/null || echo "parse_error")
echo "Observed stop_reason: ${STOP_REASON_1}"

if [[ "${STOP_REASON_1}" == "max_tokens" ]]; then
  echo "PASS: Received expected stop_reason: max_tokens"
else
  echo "FAIL: Expected 'max_tokens', got '${STOP_REASON_1}'"
fi

echo ""
echo "=== Probe 2: Testing stop_sequence Termination ==="
PAYLOAD_STOP_SEQ=$(cat <<JSON
{
  "model": "${MODEL}",
  "max_tokens": 100,
  "stop_sequences": ["STOP_HERE"],
  "messages": [
    {
      "role": "user",
      "content": "Count from 1 to 5, then print STOP_HERE, then count from 6 to 10."
    }
  ]
}
JSON
)

RESP_STOP_SEQ=$(curl -s -w "\nHTTP_STATUS:%{http_code}\nTIME_TOTAL:%{time_total}s\n" \
  -X POST "${API_URL}" \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -H "anthropic-version: ${ANTHROPIC_VERSION}" \
  -H "content-type: application/json" \
  -d "${PAYLOAD_STOP_SEQ}")

HTTP_STATUS_2=$(echo "${RESP_STOP_SEQ}" | grep "HTTP_STATUS:" | cut -d: -f2)
TIME_TOTAL_2=$(echo "${RESP_STOP_SEQ}" | grep "TIME_TOTAL:" | cut -d: -f2)
BODY_2=$(echo "${RESP_STOP_SEQ}" | grep -v "HTTP_STATUS:" | grep -v "TIME_TOTAL:")

echo "HTTP Status: ${HTTP_STATUS_2} (${TIME_TOTAL_2})"
STOP_REASON_2=$(python3 -c "import sys, json; data=json.loads(sys.argv[1]); print(data.get('stop_reason', 'none'))" "${BODY_2}" 2>/dev/null || echo "parse_error")
STOP_SEQUENCE_VAL=$(python3 -c "import sys, json; data=json.loads(sys.argv[1]); print(data.get('stop_sequence', 'none'))" "${BODY_2}" 2>/dev/null || echo "none")
echo "Observed stop_reason: ${STOP_REASON_2}"
echo "Observed stop_sequence: ${STOP_SEQUENCE_VAL}"

if [[ "${STOP_REASON_2}" == "stop_sequence" ]]; then
  echo "PASS: Received expected stop_reason: stop_sequence"
else
  echo "FAIL: Expected 'stop_sequence', got '${STOP_REASON_2}'"
fi
