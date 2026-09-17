# Streaming Refusal Guardrails and Fallback Loops

Production recipe for detecting Claude streaming refusals, classifying failure semantics (safety violations, prompt injections, policy boundaries, and truncation), and executing deterministic client-side fallback circuits.

## Overview

When building interactive agent applications, relying purely on the model to complete its response before handling refusals creates poor user experiences and risks propagating invalid or unmoderated output. This recipe implements:

- **Sub-token prefix buffer inspection:** Intercepting refusal phrases within the first 15–40 streaming chunks before flushing to the UI.
- **Stop-reason classification:** Distinguishing between standard termination (`end_turn`), model refusals (`refusal`), token truncation (`max_tokens`), and tool invocation (`tool_use`).
- **Semantic triage:** Classifying refusals into safety violations, prompt injection attempts, or operational policy constraints.
- **Deterministic fallback loops:** Routing refusals to static canned responses, constraint-relaxed retry prompts, or secondary model escalation (`claude-3-5-sonnet-20241022` to `claude-3-5-haiku-20241022`).
- **Conversational continuity:** Preserving the integrity of the conversation message stack so subsequent turns remain consistent.

## Directory Structure

```text
29-streaming-refusal-guardrails/
├── README.md
├── metadata.json
├── .env.example
├── test_probe.sh
├── python/
│   ├── refusal_guardrails.py
│   └── requirements.txt
└── typescript/
    ├── package.json
    ├── tsconfig.json
    └── src/
        └── refusal_guardrails.ts
```

## Quickstart

### Python

1. Install dependencies:
   ```bash
   pip install -r python/requirements.txt
   ```
2. Configure API key:
   ```bash
   cp .env.example .env
   # Set your ANTHROPIC_API_KEY in .env
   ```
3. Run the streaming guardrail module:
   ```bash
   python3 -c "from python.refusal_guardrails import RefusalClassifier; print(RefusalClassifier.evaluate_initial_chunk('I cannot fulfill this request.'))"
   ```

### TypeScript

1. Install dependencies:
   ```bash
   cd typescript && npm install
   ```
2. Build the TypeScript package:
   ```bash
   npm run build
   ```

## Automated Verification

Execute the sub-5-second validation probe:
```bash
./test_probe.sh
```
