#!/usr/bin/env bash
# curl_probe.sh: Inspect Claude extended thinking content blocks and cryptographic signatures
set -euo pipefail

API_URL="https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION="2023-06-01"
MODEL="claude-3-7-sonnet-20250219"
THINKING_BUDGET=2048

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "ERROR: ANTHROPIC_API_KEY environment variable is not set." >&2
  echo "Usage: export ANTHROPIC_API_KEY='sk-ant-api03-...' && ./curl_probe.sh" >&2
  exit 1
fi

echo "================================================================="
echo "Claude Extended Thinking: Content Blocks & Signature Probe"
echo "Target Model: ${MODEL}"
echo "Thinking Budget: ${THINKING_BUDGET} tokens"
echo "================================================================="

# Construct Turn 1 payload with thinking enabled
PAYLOAD_TURN_1=$(python3 -c '
import json, sys
body = {
    "model": "'"${MODEL}"'",
    "max_tokens": 4096,
    "thinking": {
        "type": "enabled",
        "budget_tokens": int("'"${THINKING_BUDGET}"'")
    },
    "messages": [
        {
            "role": "user",
            "content": "Solve this logical deduction: Alice, Bob, and Charlie sit in a row. Alice never sits next to Bob. Charlie sits to the left of Alice. What is the left-to-right order? Explain your internal reasoning."
        }
    ]
}
print(json.dumps(body))
')

echo ""
echo "--- Emitting Turn 1 Request to Messages API ---"
RESP_1=$(curl -s -w "\nHTTP_STATUS:%{http_code}\nTIME_TOTAL:%{time_total}s\n" \
  -X POST "${API_URL}" \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -H "anthropic-version: ${ANTHROPIC_VERSION}" \
  -H "content-type: application/json" \
  -d "${PAYLOAD_TURN_1}")

STATUS_1=$(echo "${RESP_1}" | grep "HTTP_STATUS:" | cut -d':' -f2)
TIME_1=$(echo "${RESP_1}" | grep "TIME_TOTAL:" | cut -d':' -f2)
BODY_1=$(echo "${RESP_1}" | sed '/HTTP_STATUS:/d' | sed '/TIME_TOTAL:/d')

if [[ "${STATUS_1}" != "200" ]]; then
  echo "Turn 1 probe failed with HTTP status ${STATUS_1}:"
  echo "${BODY_1}"
  exit 1
fi

echo "Turn 1 Success (HTTP ${STATUS_1}) in ${TIME_1}s"

# Parse Turn 1 content blocks, extract thinking, signature, and text
SERIALIZED_ASSISTANT_CONTENT=$(python3 -c '
import sys, json

data = json.loads(sys.stdin.read())
content_blocks = data.get("content", [])
usage = data.get("usage", {})

print(f"\nUsage Accounting:")
print(f"  Input Tokens:  {usage.get(\"input_tokens\", 0)}")
print(f"  Output Tokens: {usage.get(\"output_tokens\", 0)}")

thinking_blocks = [b for b in content_blocks if b.get("type") == "thinking"]
text_blocks = [b for b in content_blocks if b.get("type") == "text"]

print(f"\nContent Block Breakdown:")
print(f"  Total Content Blocks: {len(content_blocks)}")
print(f"  Thinking Blocks:      {len(thinking_blocks)}")
print(f"  Text Blocks:          {len(text_blocks)}")

for idx, tb in enumerate(thinking_blocks, 1):
    raw_thought = tb.get("thinking", "")
    sig = tb.get("signature", "")
    preview = raw_thought[:120].replace("\n", " ")
    print(f"\n[Thinking Block {idx}]:")
    print(f"  Character length: {len(raw_thought)}")
    print(f"  Trace preview:    \"{preview}...\"")
    print(f"  Signature length: {len(sig)} characters")
    print(f"  Signature prefix: \"{sig[:32]}...\"")

for idx, txt in enumerate(text_blocks, 1):
    print(f"\n[Text Block {idx}]:")
    print(txt.get("text", "").strip())

# Dump serialized blocks to stdout for turn 2 construction
with open("/tmp/assistant_turn.json", "w") as f:
    json.dump(content_blocks, f)
' <<< "${BODY_1}")

echo "${SERIALIZED_ASSISTANT_CONTENT}"

echo ""
echo "--- Emitting Turn 2 Request (Passing Assistant Turn with Signature Intact) ---"

PAYLOAD_TURN_2=$(python3 -c '
import json
with open("/tmp/assistant_turn.json") as f:
    assistant_content = json.load(f)

body = {
    "model": "'"${MODEL}"'",
    "max_tokens": 4096,
    "thinking": {
        "type": "enabled",
        "budget_tokens": int("'"${THINKING_BUDGET}"'")
    },
    "messages": [
        {
            "role": "user",
            "content": "Solve this logical deduction: Alice, Bob, and Charlie sit in a row. Alice never sits next to Bob. Charlie sits to the left of Alice. What is the left-to-right order? Explain your internal reasoning."
        },
        {
            "role": "assistant",
            "content": assistant_content
        },
        {
            "role": "user",
            "content": "Suppose David joins and sits to the right of Bob. What is the complete 4-person order now?"
        }
    ]
}
print(json.dumps(body))
')

RESP_2=$(curl -s -w "\nHTTP_STATUS:%{http_code}\nTIME_TOTAL:%{time_total}s\n" \
  -X POST "${API_URL}" \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -H "anthropic-version: ${ANTHROPIC_VERSION}" \
  -H "content-type: application/json" \
  -d "${PAYLOAD_TURN_2}")

STATUS_2=$(echo "${RESP_2}" | grep "HTTP_STATUS:" | cut -d':' -f2)
TIME_2=$(echo "${RESP_2}" | grep "TIME_TOTAL:" | cut -d':' -f2)
BODY_2=$(echo "${RESP_2}" | sed '/HTTP_STATUS:/d' | sed '/TIME_TOTAL:/d')

if [[ "${STATUS_2}" != "200" ]]; then
  echo "Turn 2 probe failed with HTTP status ${STATUS_2}:"
  echo "${BODY_2}"
  exit 1
fi

echo "Turn 2 Success (HTTP ${STATUS_2}) in ${TIME_2}s"
python3 -c '
import sys, json
data = json.loads(sys.stdin.read())
content_blocks = data.get("content", [])
tb_count = sum(1 for b in content_blocks if b.get("type") == "thinking")
txt_count = sum(1 for b in content_blocks if b.get("type") == "text")
print(f"Turn 2 Thinking Blocks: {tb_count} | Text Blocks: {txt_count}")
for b in content_blocks:
    if b.get("type") == "text":
        print(f"Answer: {b.get(\"text\", \"\").strip()}")
' <<< "${BODY_2}"

echo ""
echo "Verification complete: Reasoning traces extracted and multi-turn thought signatures validated."
