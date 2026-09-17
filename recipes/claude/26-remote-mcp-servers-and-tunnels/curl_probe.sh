#!/usr/bin/env bash
set -euo pipefail

# Configuration
TARGET_URL="${1:-http://127.0.0.1:8000}"
TOKEN="${2:-default-insecure-dev-token-change-in-production}"

echo "========================================================"
echo "Probing Remote MCP Server at: ${TARGET_URL}"
echo "========================================================"

# Probe 1: Health check
echo -n "1. Testing Health Endpoint... "
HEALTH_RESP=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/health" || echo "FAIL")
if [ "$HEALTH_RESP" == "200" ]; then
    echo "SUCCESS (HTTP 200)"
else
    echo "FAILED (HTTP ${HEALTH_RESP})"
fi

# Probe 2: Unauthorized request check
echo -n "2. Verifying Unauthorized SSE Rejection (No Token)... "
UNAUTH_RESP=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/sse" || echo "FAIL")
if [ "$UNAUTH_RESP" == "401" ]; then
    echo "SUCCESS (HTTP 401 Unauthorized correctly returned)"
else
    echo "FAILED (Expected 401, got ${UNAUTH_RESP})"
fi

# Probe 3: Authenticated SSE Handshake (Probe first chunk within 3 seconds)
echo -n "3. Testing Authenticated SSE Handshake with Bearer Auth... "
TMP_OUT=$(mktemp)
curl -s -N -m 3 -H "Authorization: Bearer ${TOKEN}" "${TARGET_URL}/sse" > "${TMP_OUT}" 2>/dev/null || true

if grep -q "endpoint" "${TMP_OUT}" || grep -q "event:" "${TMP_OUT}"; then
    echo "SUCCESS (SSE stream initiated)"
    echo "Received SSE payload snippet:"
    head -n 5 "${TMP_OUT}"
else
    echo "WARNING: Handshake completed or timed out without events (Check backend logs)"
fi
rm -f "${TMP_OUT}"

echo "========================================================"
echo "Probe execution complete."
echo "========================================================"
