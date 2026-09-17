# Claude Recipes: How to Extract Reasoning Traces and Thought Signatures

Companion code repository for the ZeroLabs technical guide: [How to Extract Reasoning Traces and Thought Signatures](https://labs.zeroshot.studio/resources/how-to-extract-reasoning-traces-and-thought-signatures).

## Contents

- `curl_probe.sh`: Executable bash probe executing 2-turn extended thinking requests, parsing `thinking` and `text` content blocks, and verifying cryptographic thought signatures.
- `python/reasoning_traces.py`: Python script demonstrating content block extraction, thought signature retention across conversational turns, and offline mock verification.
- `typescript/reasoningTraces.ts`: TypeScript counterpart with full type interfaces (`ThinkingBlock`, `TextBlock`, `AssistantMessageTurn`) and multi-turn conversation assembly.
- `metadata.json`: Recipe metadata and curriculum taxonomy tags.
- `.env.example`: Environment variable template.

## Quickstart

### 1. Configure Environment

```bash
cp .env.example .env
export ANTHROPIC_API_KEY="sk-ant-api03-your-key-here"
```

### 2. Run Executable cURL Probe

```bash
chmod +x curl_probe.sh
./curl_probe.sh
```

### 3. Run Python Verification

```bash
python3 python/reasoning_traces.py
```

### 4. Run TypeScript Verification

```bash
npx tsx typescript/reasoningTraces.ts
```
