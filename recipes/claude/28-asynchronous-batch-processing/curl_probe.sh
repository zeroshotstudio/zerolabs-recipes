#!/usr/bin/env bash
# cURL probe for Anthropic Message Batches API
# Demonstrates batch submission, status checking, and result retrieval.

set -euo pipefail

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "[-] ERROR: ANTHROPIC_API_KEY environment variable is not set." >&2
  exit 1
fi

API_VERSION="2023-06-01"
BASE_URL="https://api.anthropic.com/v1/messages/batches"

echo "[1] Creating a test message batch..."
BATCH_RESPONSE=$(curl -s -X POST "${BASE_URL}" \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -H "anthropic-version: ${API_VERSION}" \
  -H "content-type: application/json" \
  -d '{
    "requests": [
      {
        "custom_id": "probe-req-001",
        "params": {
          "model": "claude-3-5-sonnet-20241022",
          "max_tokens": 100,
          "messages": [
            {"role": "user", "content": "Return the single word: PROBE_OK"}
          ]
        }
      }
    ]
  }')

echo "${BATCH_RESPONSE}"
BATCH_ID=$(echo "${BATCH_RESPONSE}" | grep -o '"id": *"[^"]*"' | head -n 1 | cut -d'"' -f4)

if [ -z "${BATCH_ID}" ]; then
  echo "[-] Failed to extract batch ID." >&2
  exit 1
fi

echo "[+] Batch ID: ${BATCH_ID}"

echo "[2] Polling batch status..."
STATUS_RESPONSE=$(curl -s -X GET "${BASE_URL}/${BATCH_ID}" \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -H "anthropic-version: ${API_VERSION}")

echo "${STATUS_RESPONSE}"

echo "[3] Probe complete. To retrieve results once processing_status is 'ended':"
echo "curl -s -X GET \"${BASE_URL}/${BATCH_ID}/results\" \\"
echo "  -H \"x-api-key: \${ANTHROPIC_API_KEY}\" \\"
echo "  -H \"anthropic-version: ${API_VERSION}\""
