# Recipe 15: How to Handle Schema Mismatches and Repair Responses

Implement deterministic multi-turn schema repair loops for Claude responses. Catch JSON syntax failures, missing fields, type coercion errors, and regex mismatches using Pydantic (Python) or Zod (TypeScript), and feed structured validation issues back to Claude for immediate self-correction.

## Architecture Overview

```
Client Prompt ---> Claude (Attempt 1) ---> Raw Output
                                                |
                                      [Parse & Validate]
                                        /            \
                                    (Pass)         (Fail)
                                      |               |
                               Validated Output   Format Error Messages
                                                      |
                                           Append Assistant Turn + User Feedback
                                                      |
                                           Claude (Attempt 2 / Max 3)
                                                      |
                                          [Circuit Breaker Trips]
                                                      |
                                            Fallback to DLQ Event Log
```

## Directory Structure

```
.
├── .env.example              # Environment variables template
├── README.md                 # Recipe documentation and execution guide
├── blog-post.md              # Full engineering article
├── curl_probe.sh             # Executable shell script probing multi-turn repair
├── metadata.json             # Post metadata and CMS configuration
├── python/
│   ├── requirements.txt      # Python dependencies (anthropic, pydantic)
│   └── schema_repair.py      # Pydantic schema validation & dynamic repair loop
└── typescript/
    ├── package.json          # Node.js project manifest
    ├── tsconfig.json         # TypeScript compiler configuration
    └── src/
        └── schemaRepair.ts   # Zod schema validation & dynamic repair loop
```

## Prerequisites

- Python 3.10+ or Node.js 18+
- Active Anthropic API key

```bash
cp .env.example .env
export ANTHROPIC_API_KEY="sk-ant-..."
```

## Quickstart

### cURL Probe

Test multi-turn error feedback and schema self-correction directly via the Messages API:

```bash
chmod +x curl_probe.sh
./curl_probe.sh
```

### Python Implementation

Install dependencies and run the Pydantic repair loop:

```bash
cd python
pip install -r requirements.txt
python schema_repair.py
```

### TypeScript Implementation

Install dependencies, compile, and run the Zod repair loop:

```bash
cd typescript
npm install
npm run start
```
