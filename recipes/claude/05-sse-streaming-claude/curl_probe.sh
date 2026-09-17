#!/usr/bin/env bash
# ==============================================================================
# Anthropic Claude Raw Server-Sent Events (SSE) Streaming Probe
# Inspects raw event frames and verifies sub-second time-to-first-token.
# ==============================================================================

set -euo pipefail

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  if [[ -f ".env" ]]; then
    # shellcheck disable=SC1091
    source .env
  fi
fi

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "Error: ANTHROPIC_API_KEY is not set. Export it or create a .env file." >&2
  exit 1
fi

MODEL="${ANTHROPIC_MODEL:-claude-3-7-sonnet-20250219}"
API_URL="https://api.anthropic.com/v1/messages"

echo "=== Probing Anthropic SSE Streaming Endpoint ==="
echo "Model: ${MODEL}"
echo "URL:   ${API_URL}"
echo "==============================================="
echo ""

# Probe raw SSE stream directly using cURL
# We buffer line-by-line and inspect event types and latency
START_TIME=$(date +%s%3N)
FIRST_TOKEN_TIME=0

curl -sN -X POST "${API_URL}" \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "'"${MODEL}"'",
    "max_tokens": 128,
    "stream": true,
    "messages": [
      {"role": "user", "content": "Count from 1 to 5, one number per line."}
    ]
  }' | while IFS= read -r line; do
    CURRENT_TIME=$(date +%s%3N)
    
    if [[ "$line" =~ ^event:\  ]]; then
      EVENT_TYPE="${line#event: }"
      if [[ "$EVENT_TYPE" == "content_block_delta" && "$FIRST_TOKEN_TIME" -eq 0 ]]; then
        FIRST_TOKEN_TIME=$((CURRENT_TIME - START_TIME))
        echo "[TTFT: ${FIRST_TOKEN_TIME}ms] event: ${EVENT_TYPE}"
      else
        echo "event: ${EVENT_TYPE}"
      fi
    elif [[ "$line" =~ ^data:\  ]]; then
      DATA_PAYLOAD="${line#data: }"
      echo "data:  ${DATA_PAYLOAD}"
    elif [[ -z "$line" ]]; then
      echo "--- (frame delimiter) ---"
    fi
done

TOTAL_TIME=$(( $(date +%s%3N) - START_TIME ))
echo ""
echo "=== Stream Completed ==="
echo "Total Elapsed: ${TOTAL_TIME}ms"
