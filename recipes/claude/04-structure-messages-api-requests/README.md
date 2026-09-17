# Claude Messages API Request Structure & Roles Recipe

Production-ready test harnesses and implementation recipes demonstrating how to structure Anthropic Messages API requests, manage strict role alternation, provide root-level system parameters, handle multi-modal blocks, and sequence tool executions across Python, TypeScript, and raw cURL.

Published as part of the ZeroLabs Claude Developer Curriculum: [How to Structure Messages API Requests and Roles](https://labs.zeroshot.studio/resources/how-to-structure-messages-api-requests-and-roles).

## Architectural Foundations

Unlike legacy chat completions endpoints that mix system instructions into the conversational history array, the Anthropic Messages API treats system instructions as a root-level parameter. The `messages` array strictly contains alternating `user` and `assistant` turns:

1. **Root-Level System Parameter**: Supplied directly as `system` (string or content block array) to isolate instructions and optimize prompt caching.
2. **Strict Turn Alternation**: Messages must alternate between `user` and `assistant` roles, starting with `user`.
3. **Structured Content Blocks**: Content can be a single plain string or an array of typed blocks (`text`, `image`, `document`, `tool_use`, `tool_result`).
4. **Tool Use Lifecycle**: The assistant generates a `tool_use` block, and the client application answers in the next turn with a `user` message containing a corresponding `tool_result` block with matching `tool_use_id`.

## Files

- `curl_probe.sh`: Low-overhead bash probe verifying the `/v1/messages` endpoint structure directly with `curl` and `jq`.
- `python/messages_requests.py`: Complete typed Python script demonstrating root system prompts, multi-turn history, multimodal image blocks, tool invocation roundtrips, and error boundaries.
- `typescript/messages_requests.ts`: TypeScript harness using `@anthropic-ai/sdk` covering identical structural scenarios.
- `.env.example`: Configuration template for API keys.

## Quick Start

### 1. Raw cURL Probe
```bash
export ANTHROPIC_API_KEY="your-api-key-here"
chmod +x curl_probe.sh
./curl_probe.sh
```

### 2. Python Test Harness
```bash
# Setup virtual environment and dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install anthropic python-dotenv

# Run test suite
python3 python/messages_requests.py
```

### 3. TypeScript Test Harness
```bash
# Install dependencies
npm install @anthropic-ai/sdk dotenv tsx

# Execute via tsx
npx tsx typescript/messages_requests.ts
```
