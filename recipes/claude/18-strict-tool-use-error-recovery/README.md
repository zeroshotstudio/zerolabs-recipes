# Recipe 18: How to Implement Strict Tool Use and Error Recovery Loops

Implement resilient Claude tool use and error recovery loops using the Anthropic Messages API. Catch client-side schema validation failures, database timeouts, and execution exceptions, then return descriptive diagnostic feedback via `tool_result` blocks with `is_error: true` so Claude can self-correct parameters autonomously within a bounded turn budget.

## Architecture Overview

```
User Intent ---> Claude Messages API ---> stop_reason: "tool_use"
                                                  |
                                         [Client Tool Dispatch]
                                           /                 \
                                    (Success)             (Failure / Exception)
                                       |                             |
                               tool_result block             tool_result block
                                { content }                   { is_error: true, content: diagnostic }
                                       \                             /
                                        \                           /
                                         Append User Turn to History
                                                     |
                                         Claude Next Turn (Self-Correction)
                                                     |
                                         [Max Turn Budget Tripped?]
                                           /                   \
                                         (No)                 (Yes)
                                          |                     |
                                    Iterate Loop        Circuit Breaker -> DLQ
```

## Directory Structure

```
.
├── .env.example              # Environment variables template
├── README.md                 # Recipe documentation and execution guide
├── blog-post.md              # Full engineering article
├── curl_probe.sh             # Executable shell script probing error recovery loop
├── metadata.json             # Post metadata and CMS configuration
├── python/
│   ├── requirements.txt      # Python dependencies (anthropic)
│   └── strict_tool_loop.py   # Python bounded tool loop with is_error handling
└── typescript/
    ├── package.json          # Node.js project manifest (anthropic, zod)
    ├── tsconfig.json         # TypeScript compiler configuration
    └── src/
        └── index.ts          # TypeScript bounded tool loop with Zod validation
```

## Prerequisites

- Python 3.10+ or Node.js 18+
- Active Anthropic API key

```bash
cp .env.example .env
export ANTHROPIC_API_KEY="sk-ant-api03-..."
```

## Quickstart

### cURL Probe

Test multi-turn `is_error: true` injection and Claude parameter self-correction directly via the Messages API:

```bash
chmod +x curl_probe.sh
./curl_probe.sh
```

### Python Implementation

Install dependencies and run the Python strict tool loop:

```bash
cd python
pip install -r requirements.txt
python strict_tool_loop.py
```

### TypeScript Implementation

Install dependencies, compile, and run the TypeScript Zod-validated tool loop:

```bash
cd typescript
npm install
npm run start
```
