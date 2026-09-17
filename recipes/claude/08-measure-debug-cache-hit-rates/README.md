# Claude API Prompt Cache Hit Rate Telemetry & Debugging

Production patterns and test harnesses for tracking Anthropic Claude prompt cache hit rates, calculating cost savings and latency deltas (TTFT reduction), and debugging cache-busting pitfalls across Python, TypeScript, and raw cURL probes.

Published as part of the ZeroLabs Claude Developer Curriculum: [How to Measure and Debug Cache Hit Rates](https://labs.zeroshot.studio/resources/how-to-measure-and-debug-cache-hit-rates).

## Files

- `curl_probe.sh`: Executable bash probe performing sequential cold write and warm read requests against `/v1/messages`, checking `cache_creation_input_tokens` vs `cache_read_input_tokens`.
- `python/cache_metrics.py`: Python module implementing `CachedAnthropicTelemetry` middleware, calculating cache hit rate percentages, TTFT latency deltas, and automated aggregate telemetry summaries.
- `typescript/cache_metrics.ts`: TypeScript module providing typed telemetry classes, cost reduction mathematics, and cache diagnostic harnesses.
- `.env.example`: Environment template for local testing.
- `metadata.json`: Content metadata for the ZeroLabs CMS.

## Quick Start

### 1. Raw cURL Probe
```bash
export ANTHROPIC_API_KEY="sk-ant-api..."
chmod +x curl_probe.sh
./curl_probe.sh
```

### 2. Python Test Harness
```bash
cp .env.example .env
python3 -m venv .venv
source .venv/bin/activate
pip install anthropic python-dotenv

# Run diagnostic demonstration (requires valid ANTHROPIC_API_KEY)
python3 python/cache_metrics.py --demo
```

### 3. TypeScript Test Harness
```bash
npm install @anthropic-ai/sdk dotenv tsx

# Run diagnostic demonstration (requires valid ANTHROPIC_API_KEY)
npx tsx typescript/cache_metrics.ts --demo
```
