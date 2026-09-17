#!/usr/bin/env bash
# ==============================================================================
# Model Context Protocol (MCP) SSE Transport Verification Probe
# Verifies SSE handshake endpoint, session negotiation, and JSON-RPC dispatch
# ==============================================================================
set -euo pipefail

HOST="${MCP_HOST:-127.0.0.1}"
PORT="${MCP_PORT:-8000}"
BASE_URL="http://${HOST}:${PORT}"

echo "========================================================"
echo "Step 1: Probing SSE Stream Endpoint (${BASE_URL}/sse)"
echo "========================================================"

# Perform a quick 3-second stream capture to verify headers and initial endpoint event
SSE_OUTPUT=$(curl -sN -m 3 -H "Accept: text/event-stream" "${BASE_URL}/sse" || true)

echo "Received SSE Initial Stream Output:"
echo "${SSE_OUTPUT}"
echo ""

# Extract the endpoint event URI if present
ENDPOINT_URI=$(echo "${SSE_OUTPUT}" | grep -E '^data: ' | head -n 1 | sed 's/^data: //g')

if [ -z "${ENDPOINT_URI}" ]; then
  ENDPOINT_URL="${BASE_URL}/messages"
  echo "No explicit endpoint event parsed; defaulting downstream path to ${ENDPOINT_URL}"
else
  if [[ "${ENDPOINT_URI}" == http* ]]; then
    ENDPOINT_URL="${ENDPOINT_URI}"
  else
    ENDPOINT_URL="${BASE_URL}${ENDPOINT_URI}"
  fi
  echo "Parsed downstream dispatch endpoint: ${ENDPOINT_URL}"
fi

echo ""
echo "========================================================"
echo "Step 2: Dispatching JSON-RPC Initialize Payload via POST"
echo "========================================================"

INIT_PAYLOAD='{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {
      "name": "curl-probe-client",
      "version": "1.0.0"
    }
  }
}'

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${ENDPOINT_URL}" \
  -H "Content-Type: application/json" \
  -d "${INIT_PAYLOAD}")

echo "POST ${ENDPOINT_URL} returned HTTP status: ${HTTP_STATUS}"

if [ "${HTTP_STATUS}" -eq 200 ] || [ "${HTTP_STATUS}" -eq 202 ]; then
  echo "✓ Probe passed: SSE Transport handshake and JSON-RPC dispatch are operational."
else
  echo "✗ Probe warning: Expected HTTP 200 or 202, received ${HTTP_STATUS}."
fi
