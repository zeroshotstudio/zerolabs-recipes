#!/usr/bin/env bash
# curl_probe.sh: Stream extended thinking SSE events from Anthropic Messages API
set -euo pipefail

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "ERROR: ANTHROPIC_API_KEY environment variable is not set." >&2
  echo "Usage: export ANTHROPIC_API_KEY='sk-ant-api...' && ./curl_probe.sh" >&2
  exit 1
fi

API_URL="https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION="2023-06-01"
MODEL="${ANTHROPIC_MODEL:-claude-3-7-sonnet-20250219}"
BUDGET_TOKENS=2048
MAX_TOKENS=4096

echo "================================================================="
echo "ZeroLabs Claude Extended Thinking Stream Probe"
echo "Model: ${MODEL}"
echo "Endpoint: ${API_URL}"
echo "Thinking Budget: ${BUDGET_TOKENS} tokens"
echo "Max Output: ${MAX_TOKENS} tokens"
echo "================================================================="

# Create temporary files for payload and raw stream capture
PAYLOAD_FILE=$(mktemp /tmp/thinking_payload.XXXXXX.json)
STREAM_OUTPUT=$(mktemp /tmp/thinking_stream.XXXXXX.txt)
trap 'rm -f "${PAYLOAD_FILE}" "${STREAM_OUTPUT}"' EXIT

cat <<EOF > "${PAYLOAD_FILE}"
{
  "model": "${MODEL}",
  "max_tokens": ${MAX_TOKENS},
  "thinking": {
    "type": "enabled",
    "budget_tokens": ${BUDGET_TOKENS}
  },
  "stream": true,
  "messages": [
    {
      "role": "user",
      "content": "Solve this logical puzzle step by step: Four colleagues (Alice, Bob, Carol, and Dave) sit in a row of four chairs numbered 1 to 4 from left to right. Alice will not sit in chair 1 or 4. Bob sits immediately to the right of Carol. Where does Dave sit? Provide the deduction."
    }
  ]
}
EOF

echo ""
echo "Connecting to Anthropic SSE stream..."

# Stream directly with curl, writing raw output to file
curl -s -N -X POST "${API_URL}" \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -H "anthropic-version: ${ANTHROPIC_VERSION}" \
  -H "content-type: application/json" \
  -d @"${PAYLOAD_FILE}" > "${STREAM_OUTPUT}"

echo "Stream complete. Parsing received Server-Sent Events..."
echo "================================================================="

python3 -c "
import sys
import json

raw_file = '${STREAM_OUTPUT}'
events = []
current_event = None

with open(raw_file, 'r', encoding='utf-8', errors='ignore') as f:
    for line in f:
        line = line.rstrip('\r\n')
        if line.startswith('event:'):
            current_event = line[len('event:'):].strip()
        elif line.startswith('data:'):
            data_str = line[len('data:'):].strip()
            if data_str == '[DONE]':
                continue
            try:
                data = json.loads(data_str)
                events.append((current_event, data))
            except json.JSONDecodeError:
                pass
            current_event = None

thinking_chars = 0
text_chars = 0
signature_found = False
block_types = []
usage_info = {}

for event_type, data in events:
    if event_type == 'content_block_start':
        block = data.get('content_block', {})
        btype = block.get('type')
        block_types.append(btype)
        print(f'[START] Block index {data.get(\"index\")} type: {btype}')
    elif event_type == 'content_block_delta':
        delta = data.get('delta', {})
        dtype = delta.get('type')
        if dtype == 'thinking_delta':
            thinking_chars += len(delta.get('thinking', ''))
        elif dtype == 'signature_delta':
            signature_found = True
            print('[SIGNATURE] Received thinking signature delta')
        elif dtype == 'text_delta':
            text_chars += len(delta.get('text', ''))
    elif event_type == 'content_block_stop':
        print(f'[STOP] Block index {data.get(\"index\")}')
    elif event_type == 'message_delta':
        usage_info = data.get('usage', {})

print('=================================================================')
print(f'Total Content Blocks: {len(block_types)} -> {block_types}')
print(f'Accumulated Thinking Characters: {thinking_chars}')
print(f'Accumulated Text Characters: {text_chars}')
print(f'Thinking Signature Captured: {signature_found}')
if usage_info:
    print(f'Output Tokens Billed: {usage_info.get(\"output_tokens\", \"N/A\")}')

if 'thinking' in block_types and thinking_chars > 0:
    print('VERIFICATION SUCCESS: Thinking blocks successfully parsed via SSE stream!')
    sys.exit(0)
else:
    print('VERIFICATION FAILED: Thinking blocks not observed in event stream.')
    sys.exit(1)
"
