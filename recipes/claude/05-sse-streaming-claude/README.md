# Server-Sent Event (SSE) Streaming with Anthropic Claude

Production recipes for consuming streaming Server-Sent Events (SSE) from the Anthropic Claude Messages API across Python, TypeScript, and raw cURL probes.

Published as part of the ZeroLabs Claude Developer Curriculum: [How to Implement Server-Sent Event Streaming with Claude](https://labs.zeroshot.studio/resources/how-to-implement-server-sent-event-streaming-with-claude).

## Architecture & Stream Lifecycle

Anthropic Claude streams text and tool invocations via standard HTTP Server-Sent Events (`text/event-stream`). The stream sequence follows a strict lifecycle:

1. `message_start`: Initial message metadata (ID, model, input token usage).
2. `content_block_start`: Start of a text or tool use content block.
3. `content_block_delta`: Streaming token payload (`text_delta` or `input_json_delta`).
4. `content_block_stop`: Content block completion.
5. `message_delta`: Final message metadata (stop reason, cumulative output token usage).
6. `message_stop`: Stream closure.

## Files

- `curl_probe.sh`: Low-level executable bash probe using cURL to measure time-to-first-token (TTFT) and inspect raw SSE protocol frames.
- `python/stream_messages.py`: Dual implementation demonstrating both raw event-level parsing (`client.messages.create(stream=True)`) and the high-level context manager helper (`client.messages.stream()`).
- `typescript/stream_messages.ts`: Dual TypeScript implementation showing async iterable stream consumption and event emitter patterns (`createMessageStream`).
- `.env.example`: Template configuration file for setting your API key and target model.

## Quick Start

### 1. Raw cURL Probe

Verify connectivity and inspect wire protocol frames directly:

```bash
export ANTHROPIC_API_KEY="your-api-key-here"
chmod +x curl_probe.sh
./curl_probe.sh
```

### 2. Python Stream Harness

```bash
# Setup environment
cp .env.example .env
# Edit .env with your key
python3 -m venv .venv
source .venv/bin/activate
pip install anthropic python-dotenv

# Run streaming harness
python3 python/stream_messages.py
```

### 3. TypeScript Stream Harness

```bash
npm install @anthropic-ai/sdk dotenv tsx
npx tsx typescript/stream_messages.ts
```

## Security Notice

Never commit your `.env` file or hardcode credentials. Always pass keys via environment variables or secret management daemons.
