#!/usr/bin/env bash
# Test Claude Computer Use tool schema registration and initial screenshot probe
set -euo pipefail

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "Error: ANTHROPIC_API_KEY environment variable is not set." >&2
  exit 1
fi

MODEL="${MODEL:-claude-3-7-sonnet-20250219}"
BETAS="${BETAS:-computer-use-2025-01-24}"
DISPLAY_WIDTH="${DISPLAY_WIDTH_PX:-1024}"
DISPLAY_HEIGHT="${DISPLAY_HEIGHT_PX:-768}"
DISPLAY_NUMBER="${DISPLAY_NUM:-1}"

echo "Probe: Dispatching initial Computer Use request to Anthropic API..."
echo "Model: ${MODEL}"
echo "Display: ${DISPLAY_WIDTH}x${DISPLAY_HEIGHT} (display #${DISPLAY_NUMBER})"

curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: ${BETAS}" \
  -H "content-type: application/json" \
  -d '{
    "model": "'"${MODEL}"'",
    "max_tokens": 1024,
    "tools": [
      {
        "type": "computer_20250124",
        "name": "computer",
        "display_width_px": '"${DISPLAY_WIDTH}"',
        "display_height_px": '"${DISPLAY_HEIGHT}"',
        "display_number": '"${DISPLAY_NUMBER}"'
      }
    ],
    "messages": [
      {
        "role": "user",
        "content": "Take a screenshot of the desktop to check the current window state."
      }
    ]
  }' | jq '.'
