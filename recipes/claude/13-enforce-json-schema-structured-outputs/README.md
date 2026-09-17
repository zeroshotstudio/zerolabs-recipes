# Enforce JSON Schema with Structured Outputs Recipe

Deterministic structured data extraction from Claude using forced tool choice, JSON Schema validation, and typed deserialization across Python, TypeScript, and cURL.

Published as part of the ZeroLabs Claude Developer Curriculum: [How to Enforce JSON Schema with Structured Outputs](https://labs.zeroshot.studio/resources/how-to-enforce-json-schema-with-claude-structured-outputs).

## Architectural Foundations

While standard system prompts can request JSON responses, large language models without schema constraints occasionally introduce markdown wrappers, preamble text, missing keys, or improper types. The Anthropic Messages API solves this via **forced tool calling**:

1. **Strict JSON Schema Tools**: Define expected entity fields inside the `tools` array using standard JSON Schema definitions (`properties`, `required`, `additionalProperties: false`, `enum`).
2. **Forced Tool Choice**: Set `tool_choice: {"type": "tool", "name": "..."}`. This forces Claude to respond with an invocation of that specific tool rather than generating freeform conversational text.
3. **Structured Tool Block**: Claude emits a `tool_use` block containing the parsed JSON payload inside `input`.
4. **Deterministic Stop Reason**: The request completes with `stop_reason: "tool_use"`, guaranteeing that the response payload adheres to the target schema.
5. **Runtime Type Validation**: Client harnesses (Pydantic in Python, runtime assertions in TypeScript) validate the decoded payload before passing downstream to production databases or message queues.

## Files

- `curl_probe.sh`: Executable bash probe sending raw JSON Schema payloads with forced tool choice to the `/v1/messages` endpoint and inspecting the extracted `tool_use` block.
- `python/structured_outputs.py`: Python implementation utilizing the official `anthropic` SDK, Pydantic domain models, and forced tool choice.
- `typescript/structured_outputs.ts`: TypeScript implementation utilizing the official `@anthropic-ai/sdk`, strict interfaces, and runtime type assertions.
- `.env.example`: Configuration template for Anthropic API credentials.
- `metadata.json`: Recipe metadata and taxonomy tags.
- `blog-post.md`: Companion technical guide.

## Quick Start

### 1. Direct cURL Probe
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
pip install anthropic pydantic python-dotenv

# Run test suite
python3 python/structured_outputs.py
```

### 3. TypeScript Test Harness
```bash
# Install dependencies
npm install @anthropic-ai/sdk dotenv tsx

# Execute via tsx
npx tsx typescript/structured_outputs.ts
```
