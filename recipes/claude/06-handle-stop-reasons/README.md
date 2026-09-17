# Claude API Stop Reasons & Max Token Truncation Recipe

Production patterns and test harnesses for handling Anthropic Claude Messages API stop reasons (`end_turn`, `max_tokens`, `stop_sequence`, `tool_use`), orchestrating continuation loops, and managing token budgets across Python, TypeScript, and raw cURL probes.

Published as part of the ZeroLabs Claude Developer Curriculum: [How to Handle Stop Reasons and Max Token Truncation](https://labs.zeroshot.studio/resources/how-to-handle-stop-reasons-and-max-token-truncation).

## Files

- `curl_probe.sh`: Executable bash probe asserting HTTP status codes, latency, and `stop_reason` parsing (`max_tokens` and `stop_sequence`) against `/v1/messages`.
- `python/stop_reasons.py`: Python module implementing `inspect_stop_reason`, automatic multi-turn continuation loops (`generate_with_continuation`), and streaming `stop_reason` extraction.
- `typescript/stop_reasons.ts`: TypeScript module providing typed continuation handlers, stop sequence triggers, and streaming message delta inspection.
- `.env.example`: Environment file template for local testing.

## Quick Start

### 1. Raw cURL Probe
```bash
export ANTHROPIC_API_KEY="sk-ant-api..."
chmod +x curl_probe.sh
./curl_probe.sh
```

### 2. Python Test Harness
```bash
# Set up environment
cp .env.example .env
python3 -m venv .venv
source .venv/bin/activate
pip install anthropic python-dotenv

# Run test harness
python3 python/stop_reasons.py
```

### 3. TypeScript Test Harness
```bash
npm install @anthropic-ai/sdk dotenv tsx
npx tsx typescript/stop_reasons.ts
```
