#!/usr/bin/env bash
# curl_probe.sh: Probe Anthropic Messages API extended thinking configuration
set -euo pipefail

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "ERROR: ANTHROPIC_API_KEY environment variable is not set." >&2
  echo "Usage: export ANTHROPIC_API_KEY='sk-ant-api...' && ./curl_probe.sh" >&2
  exit 1
fi

API_URL="https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION="2023-06-01"
MODEL="${ANTHROPIC_MODEL:-claude-3-7-sonnet-20250219}"
BUDGET_TOKENS="${THINKING_BUDGET_TOKENS:-2048}"
MAX_TOKENS="${MAX_TOKENS:-4096}"

echo "================================================================="
echo "ZeroLabs Claude Extended Thinking Configuration Probe"
echo "Model: ${MODEL}"
echo "Thinking Budget: ${BUDGET_TOKENS} tokens (min: 1024)"
echo "Max Tokens: ${MAX_TOKENS} tokens"
echo "Endpoint: ${API_URL}"
echo "================================================================="

if (( BUDGET_TOKENS < 1024 )); then
  echo "ERROR: budget_tokens must be >= 1024, received: ${BUDGET_TOKENS}" >&2
  exit 1
fi

if (( MAX_TOKENS <= BUDGET_TOKENS )); then
  echo "ERROR: max_tokens (${MAX_TOKENS}) must be strictly greater than budget_tokens (${BUDGET_TOKENS})" >&2
  exit 1
fi

echo ""
echo "=== Test 1: Valid Thinking Payload Execution ==="

PAYLOAD=$(python3 -c "
import json, os

model = os.environ.get('ANTHROPIC_MODEL', 'claude-3-7-sonnet-20250219')
budget = int(os.environ.get('THINKING_BUDGET_TOKENS', '2048'))
max_tok = int(os.environ.get('MAX_TOKENS', '4096'))

payload = {
    'model': model,
    'max_tokens': max_tok,
    'thinking': {
        'type': 'enabled',
        'budget_tokens': budget
    },
    'messages': [
        {
            'role': 'user',
            'content': 'Plan an optimal database sharding key strategy for a multi-tenant SaaS accounting ledger. Provide concise trade-offs.'
        }
    ]
}
print(json.dumps(payload))
")

RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}\nTIME_TOTAL:%{time_total}s\n" \
  -X POST "${API_URL}" \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -H "anthropic-version: ${ANTHROPIC_VERSION}" \
  -H "content-type: application/json" \
  -d "${PAYLOAD}")

HTTP_STATUS=$(echo "${RESP}" | grep "HTTP_STATUS:" | cut -d: -f2)
TIME_TOTAL=$(echo "${RESP}" | grep "TIME_TOTAL:" | cut -d: -f2)
BODY=$(echo "${RESP}" | grep -v "HTTP_STATUS:" | grep -v "TIME_TOTAL:")

echo "HTTP Status: ${HTTP_STATUS} (Elapsed: ${TIME_TOTAL})"

python3 -c "
import sys, json

try:
    data = json.loads('''${BODY}''')
    if 'error' in data:
        print('API Error:', data['error'])
        sys.exit(1)

    usage = data.get('usage', {})
    print(f'Input Tokens: {usage.get(\"input_tokens\", 0)}')
    print(f'Output Tokens: {usage.get(\"output_tokens\", 0)}')

    content_blocks = data.get('content', [])
    thinking_blocks = [b for b in content_blocks if b.get('type') == 'thinking']
    text_blocks = [b for b in content_blocks if b.get('type') == 'text']

    print(f'Thinking Blocks Found: {len(thinking_blocks)}')
    print(f'Text Blocks Found: {len(text_blocks)}')

    if thinking_blocks:
        sample_thought = thinking_blocks[0].get('thinking', '')[:120].replace('\n', ' ')
        print(f'Thinking Sample: {sample_thought}...')
    if text_blocks:
        sample_text = text_blocks[0].get('text', '')[:120].replace('\n', ' ')
        print(f'Final Output Sample: {sample_text}...')

    print('PASS: Extended thinking request processed successfully.')
except Exception as e:
    print('Failed to parse response JSON:', e)
    print('''${BODY}''')
"

echo ""
echo "=== Test 2: Validation of Parameter Constraints ==="
echo "Verifying rule: temperature must NOT be customized when thinking is enabled."

INVALID_PAYLOAD=$(python3 -c "
import json
payload = {
    'model': 'claude-3-7-sonnet-20250219',
    'max_tokens': 2048,
    'temperature': 0.7,
    'thinking': {
        'type': 'enabled',
        'budget_tokens': 1024
    },
    'messages': [{'role': 'user', 'content': 'Ping'}]
}
print(json.dumps(payload))
")

RESP_ERR=$(curl -s -w "\nHTTP_STATUS:%{http_code}\n" \
  -X POST "${API_URL}" \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -H "anthropic-version: ${ANTHROPIC_VERSION}" \
  -H "content-type: application/json" \
  -d "${INVALID_PAYLOAD}")

ERR_STATUS=$(echo "${RESP_ERR}" | grep "HTTP_STATUS:" | cut -d: -f2)
ERR_BODY=$(echo "${RESP_ERR}" | grep -v "HTTP_STATUS:")

echo "Rejection Status Code: ${ERR_STATUS} (Expected: 400)"
python3 -c "
import sys, json
try:
    data = json.loads('''${ERR_BODY}''')
    err_msg = data.get('error', {}).get('message', '')
    print('Returned Error Message:', err_msg)
    if 'temperature' in err_msg.lower() or ${ERR_STATUS} == 400:
        print('PASS: API gateway rejected invalid temperature parameter as expected.')
    else:
        print('UNEXPECTED: Error did not mention temperature constraints.')
except Exception:
    print('''${ERR_BODY}''')
"
