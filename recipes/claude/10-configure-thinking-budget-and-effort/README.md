# Extended Thinking Budget and Effort Parameters Recipe

Production-ready test harnesses and implementation recipes demonstrating how to configure extended thinking budget tokens and reasoning effort parameters in the Anthropic Claude Messages API.

Published as part of the ZeroLabs Claude Developer Curriculum: [How to Configure Thinking Budget and Effort Parameters](https://labs.zeroshot.studio/resources/how-to-configure-thinking-budget-and-effort-parameters).

## Architectural Foundations

Extended thinking allows frontier reasoning models such as Claude 3.7 Sonnet to generate deliberate, visible step-by-step reasoning tokens before synthesizing final output answers.

Key parameter constraints include:

1. **Explicit Thinking Block**: Configured via `"thinking": {"type": "enabled", "budget_tokens": 2048}`.
2. **Minimum Token Threshold**: `budget_tokens` must be at least 1,024 tokens. Values below 1,024 return an HTTP 400 validation error.
3. **Strict Inequality**: `max_tokens` must be strictly greater than `budget_tokens` (`max_tokens > budget_tokens`). The difference represents the maximum tokens available for final user-facing text.
4. **Sampling Parameter Restrictions**: When thinking is enabled, `temperature` must be set to 1.0 or omitted entirely. Setting non-default values for `temperature`, `top_p`, or `top_k` returns an HTTP 400 error.
5. **Billing and Accounting**: Thinking tokens are counted as regular output tokens in API billing (`usage.output_tokens`), but appear inside distinct `type: "thinking"` content blocks.

## Directory Contents

- `curl_probe.sh`: Executable bash probe performing parameter validation and output verification against `/v1/messages`.
- `python/thinking_budget.py`: Complete Python script using the official Anthropic SDK demonstrating thinking configuration and response block parsing.
- `typescript/thinking_budget.ts`: Complete TypeScript script using `@anthropic-ai/sdk` with type-safe thinking parameters.
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

python3 thinking_budget.py
```

### 3. TypeScript Test Harness
```bash
cd typescript
npm install @anthropic-ai/sdk dotenv tsx

npx tsx thinking_budget.ts
```
