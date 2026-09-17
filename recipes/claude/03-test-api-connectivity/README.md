# Claude API Connectivity & Models Endpoint Recipe

Automated test harnesses for probing Anthropic Claude API connectivity, querying the `/v1/models` endpoint, and measuring live roundtrip latency across Python, TypeScript, and raw cURL probes.

Published as part of the ZeroLabs Claude Developer Curriculum: [How to Test Claude API & Models Endpoint](https://labs.zeroshot.studio/resources/how-to-test-claude-api-connectivity-and-models-endpoint).

## Files

- `curl_probe.sh`: Executable bash probe measuring HTTP response codes and elapsed connection latency against `/v1/models` and `/v1/messages`.
- `python/test_connectivity.py`: Python probe using `anthropic.Anthropic` to list models and measure single-token latency with explicit error boundaries (`RateLimitError`, `InternalServerError`, `APIConnectionError`).
- `typescript/test_connectivity.ts`: TypeScript probe using `@anthropic-ai/sdk` measuring roundtrip latency and parsing models payload.
- `.env.example`: Environment file template for local testing.

## Quick Start

### 1. Raw cURL Probe
```bash
export ANTHROPIC_API_KEY="your-api-key-here"
chmod +x curl_probe.sh
./curl_probe.sh
```

### 2. Python Test Harness
```bash
# Set up environment
cp .env.example .env
# Edit .env with your key
python3 -m venv .venv
source .venv/bin/activate
pip install anthropic python-dotenv

# Run connectivity test
python3 python/test_connectivity.py
```

### 3. TypeScript Test Harness
```bash
npm install @anthropic-ai/sdk dotenv tsx
npx tsx typescript/test_connectivity.ts
```
