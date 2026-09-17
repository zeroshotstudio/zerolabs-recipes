# Prompt Caching Breakpoints Recipe

Production-ready test harnesses and implementation recipes demonstrating how to configure prompt caching breakpoints in the Anthropic Claude Messages API. Includes breakpoint placement strategies across system prompts, tool schemas, and multi-turn document contexts across Python, TypeScript, and executable cURL.

Published as part of the ZeroLabs Claude Developer Curriculum: [How to Configure Prompt Caching Breakpoints](https://labs.zeroshot.studio/resources/how-to-configure-prompt-caching-breakpoints).

## Architectural Foundations

Anthropic prompt caching optimizes request latency and operating costs by storing compiled key-value (KV) activations of prompt prefixes in accelerator memory. Repeated requests sharing identical cached prefixes avoid redundant computation:

1. **Explicit Breakpoints**: Defined via `cache_control: {"type": "ephemeral"}` blocks on system messages, tool declarations, or content blocks.
2. **Quota Limits**: Up to 4 explicit cache breakpoints per API request.
3. **Minimum Token Thresholds**:
   - Claude 3.5 Sonnet / Claude 3 Opus: 1,024 tokens.
   - Claude 3.5 Haiku: 2,048 tokens.
4. **Time-to-Live (TTL)**: 5-minute rolling window, automatically refreshed upon every cache read.
5. **Cost Reductions**: Up to 90% savings on input token rates (`cache_read_input_tokens`) and up to 85% reduction in time-to-first-token (TTFT).

## Files

- `curl_probe.sh`: Executable bash probe performing cache write and cache hit assertions against `/v1/messages`.
- `python/caching_breakpoints.py`: Complete Python script using the official Anthropic SDK demonstrating system and tool cache breakpoints.
- `typescript/caching_breakpoints.ts`: Complete TypeScript script using `@anthropic-ai/sdk` with type-safe breakpoint parameters.
- `metadata.json`: Content publication metadata and curriculum taxonomy tags.
- `.env.example`: Configuration template for Anthropic API keys.

## Quick Start

### 1. Executable cURL Probe
```bash
export ANTHROPIC_API_KEY="sk-ant-api03-your-key-here"
chmod +x curl_probe.sh
./curl_probe.sh
```

### 2. Python Test Harness
```bash
cd python
python3 -m venv .venv
source .venv/bin/activate
pip install anthropic python-dotenv

python3 caching_breakpoints.py
```

### 3. TypeScript Test Harness
```bash
cd typescript
npm install @anthropic-ai/sdk dotenv tsx

npx tsx caching_breakpoints.ts
```
