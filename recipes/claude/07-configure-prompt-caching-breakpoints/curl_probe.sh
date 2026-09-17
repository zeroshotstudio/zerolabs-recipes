#!/usr/bin/env bash
# curl_probe.sh: Probe Anthropic Messages API prompt caching breakpoints
set -euo pipefail

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "ERROR: ANTHROPIC_API_KEY environment variable is not set." >&2
  echo "Usage: export ANTHROPIC_API_KEY='sk-ant-api...' && ./curl_probe.sh" >&2
  exit 1
fi

API_URL="https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION="2023-06-01"
MODEL="${ANTHROPIC_MODEL:-claude-3-5-sonnet-20241022}"

echo "================================================================="
echo "ZeroLabs Claude Prompt Caching Breakpoint Probe"
echo "Model: ${MODEL}"
echo "Endpoint: ${API_URL}"
echo "================================================================="

# Generate a repeated static document prefix exceeding 1,024 tokens (~1,500 words)
DOCUMENT_CORPUS=$(cat << 'EOF'
ZeroLabs Architecture Guideline and Operational Protocol:
Section 1: Distributed Infrastructure Architecture and Ingress Routing.
The application gateway terminates incoming TLS connections using modern cryptographic suites.
Reverse proxies maintain keep-alive pools toward internal application services to minimize handshake overhead.
Every microservice operates behind an authenticated service mesh with mutual TLS verification.
All inbound requests are assigned a unique 64-bit correlation identifier propagated across HTTP headers.
Observability pipelines consume structured logs emitted in JSON format over local Unix domain sockets.
Metrics collectors scrape Prometheus endpoints at 15-second intervals to monitor saturation and latency.
Section 2: Message Serialization, API Contract Validation, and Storage Tier.
Services communicate via strictly typed interfaces validated against schema specifications during compilation.
Database connections utilize pooled transaction runners configured with strict query timeouts.
Read operations are routed to distributed read replicas, while write operations target the primary node.
Asynchronous job queues process background tasks with exponential backoff and dead-letter queue routing.
Cache invalidation follows explicit versioned tags to eliminate stale read anomalies across nodes.
Section 3: Security Hardening, Audit Logging, and Fault Recovery.
Role-based access control enforces least privilege across internal control planes and administrative APIs.
All privileged operations generate immutable audit records dispatched to durable object storage.
Circuit breakers trip when service error rates exceed 5 percent over a rolling 60-second window.
Automated failover mechanisms switch database primaries within 30 seconds of persistent health probe failures.
Disaster recovery drills execute quarterly across isolated staging environments to verify replication integrity.
EOF
)

# Expand corpus to guarantee exceeding the 1,024 token threshold for Claude 3.5 Sonnet
LONG_SYSTEM_PROMPT="${DOCUMENT_CORPUS} ${DOCUMENT_CORPUS} ${DOCUMENT_CORPUS} ${DOCUMENT_CORPUS}"

echo ""
echo "=== Turn 1: Cache Creation (Expecting cache_creation_input_tokens > 0) ==="
PAYLOAD_TURN_1=$(python3 -c "
import json, sys, os

content = '''${LONG_SYSTEM_PROMPT}'''
payload = {
    'model': os.environ.get('ANTHROPIC_MODEL', 'claude-3-5-sonnet-20241022'),
    'max_tokens': 100,
    'system': [
        {
            'type': 'text',
            'text': content,
            'cache_control': {'type': 'ephemeral'}
        }
    ],
    'messages': [
        {'role': 'user', 'content': 'Summarize Section 1 in 20 words.'}
    ]
}
print(json.dumps(payload))
")

RESP_1=$(curl -s -w "\nHTTP_STATUS:%{http_code}\nTIME_TOTAL:%{time_total}s\n" \
  -X POST "${API_URL}" \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -H "anthropic-version: ${ANTHROPIC_VERSION}" \
  -H "content-type: application/json" \
  -d "${PAYLOAD_TURN_1}")

HTTP_STATUS_1=$(echo "${RESP_1}" | grep "HTTP_STATUS:" | cut -d: -f2)
TIME_TOTAL_1=$(echo "${RESP_1}" | grep "TIME_TOTAL:" | cut -d: -f2)
BODY_1=$(echo "${RESP_1}" | grep -v "HTTP_STATUS:" | grep -v "TIME_TOTAL:")

echo "HTTP Status: ${HTTP_STATUS_1} (Elapsed: ${TIME_TOTAL_1})"
python3 -c "
import sys, json
try:
    data = json.loads('''${BODY_1}''')
    usage = data.get('usage', {})
    print(f'Input Tokens: {usage.get(\"input_tokens\", 0)}')
    print(f'Cache Creation Tokens: {usage.get(\"cache_creation_input_tokens\", 0)}')
    print(f'Cache Read Tokens: {usage.get(\"cache_read_input_tokens\", 0)}')
    print(f'Output Tokens: {usage.get(\"output_tokens\", 0)}')
    cc = usage.get('cache_creation_input_tokens', 0)
    if cc > 0:
        print('PASS: Turn 1 successfully created prompt cache!')
    else:
        print('NOTE: cache_creation_input_tokens was 0 (check token volume or pre-existing cache).')
except Exception as e:
    print('Failed to parse response JSON:', e)
    print('''${BODY_1}''')
"

echo ""
echo "=== Turn 2: Cache Read (Expecting cache_read_input_tokens > 0) ==="
PAYLOAD_TURN_2=$(python3 -c "
import json, sys, os

content = '''${LONG_SYSTEM_PROMPT}'''
payload = {
    'model': os.environ.get('ANTHROPIC_MODEL', 'claude-3-5-sonnet-20241022'),
    'max_tokens': 100,
    'system': [
        {
            'type': 'text',
            'text': content,
            'cache_control': {'type': 'ephemeral'}
        }
    ],
    'messages': [
        {'role': 'user', 'content': 'Summarize Section 2 in 20 words.'}
    ]
}
print(json.dumps(payload))
")

RESP_2=$(curl -s -w "\nHTTP_STATUS:%{http_code}\nTIME_TOTAL:%{time_total}s\n" \
  -X POST "${API_URL}" \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -H "anthropic-version: ${ANTHROPIC_VERSION}" \
  -H "content-type: application/json" \
  -d "${PAYLOAD_TURN_2}")

HTTP_STATUS_2=$(echo "${RESP_2}" | grep "HTTP_STATUS:" | cut -d: -f2)
TIME_TOTAL_2=$(echo "${RESP_2}" | grep "TIME_TOTAL:" | cut -d: -f2)
BODY_2=$(echo "${RESP_2}" | grep -v "HTTP_STATUS:" | grep -v "TIME_TOTAL:")

echo "HTTP Status: ${HTTP_STATUS_2} (Elapsed: ${TIME_TOTAL_2})"
python3 -c "
import sys, json
try:
    data = json.loads('''${BODY_2}''')
    usage = data.get('usage', {})
    print(f'Input Tokens: {usage.get(\"input_tokens\", 0)}')
    print(f'Cache Creation Tokens: {usage.get(\"cache_creation_input_tokens\", 0)}')
    print(f'Cache Read Tokens: {usage.get(\"cache_read_input_tokens\", 0)}')
    print(f'Output Tokens: {usage.get(\"output_tokens\", 0)}')
    cr = usage.get('cache_read_input_tokens', 0)
    if cr > 0:
        print('PASS: Turn 2 hit prompt cache read!')
    else:
        print('NOTE: Cache read was 0.')
except Exception as e:
    print('Failed to parse response JSON:', e)
    print('''${BODY_2}''')
"
