# Stream Thinking Blocks to User Interfaces

Production-ready test harnesses and implementation recipes demonstrating how to stream Claude extended thinking blocks with Server-Sent Events (SSE). Covers real-time state management for collapsible UI accordions, separating reasoning tokens from user-facing answer text, signature validation, and token billing metrics across Python, TypeScript, and executable cURL.

Published as part of the ZeroLabs Claude Developer Curriculum: [How to Stream Thinking Blocks to User Interfaces](https://labs.zeroshot.studio/resources/how-to-stream-thinking-blocks-to-user-interfaces).

## Architectural Foundations

Claude models supporting extended thinking (such as Claude 3.7 Sonnet) decouple internal reasoning from output text. When streaming via SSE, the API emits distinct content blocks sequentially:

1. **Content Block Start (`thinking`)**: Emits `content_block_start` with `{"type": "thinking"}`. The frontend initializes a collapsible accordion in an expanded state.
2. **Thinking Deltas**: Emits `content_block_delta` with `{"type": "thinking_delta", "thinking": "..."}`. Thinking tokens are routed strictly to the thinking container.
3. **Signature Delta**: Emits `content_block_delta` with `{"type": "signature_delta", "signature": "..."}`. An encrypted cryptographic signature that authenticates the validity of the thinking block.
4. **Content Block Stop (`thinking`)**: Emits `content_block_stop`. The thinking phase is complete. The UI computes elapsed thinking time.
5. **Content Block Start (`text`)**: Emits `content_block_start` with `{"type": "text"}`. The client transitions UI state to `answering` and automatically collapses or minimizes the accordion.
6. **Text Deltas**: Emits `content_block_delta` with `{"type": "text_delta", "text": "..."}`. Rendered in real time in the primary answer view.
7. **Message Delta & Stop**: Emits `message_delta` with final token usage (`output_tokens`), where thinking tokens and text tokens are billed as output tokens.

## Files

- `curl_probe.sh`: Executable bash probe performing raw SSE streaming and parsing thinking deltas, signatures, and text blocks.
- `python/stream_thinking.py`: Asynchronous Python streaming client with real-time UI state tracking and metrics computation.
- `typescript/stream_thinking.ts`: TypeScript streaming handler implementing a UI accordion state machine suitable for React, Vue, or Web Components.
- `metadata.json`: Content publication metadata and curriculum taxonomy tags.
- `.env.example`: Configuration template for Anthropic API keys.
- `blog-post.md`: Complete validated technical publication.

## Quick Start

### 1. Executable cURL Probe
```bash
export ANTHROPIC_API_KEY="sk-ant-api03-your-key-here"
chmod +x curl_probe.sh
./curl_probe.sh
```

### 2. Python Streaming Harness
```bash
cd python
python3 -m venv .venv
source .venv/bin/activate
pip install anthropic python-dotenv

python3 stream_thinking.py
```

### 3. TypeScript Streaming Harness
```bash
cd typescript
npm install @anthropic-ai/sdk dotenv tsx

npx tsx stream_thinking.ts
```
