# Recipe 16: How to Define and Register Tools with Claude

Define JSON schema tools in Claude Messages API requests. Configure tool choice strategies (`auto`, `any`, `tool`, `none`), and parse tool use blocks across Python, TypeScript, and cURL.

## Architecture Overview

```
Client App ---> Messages API (tools + tool_choice) ---> Claude Decision Engine
                                                             |
                                                  [Evaluates Prompt & Schemas]
                                                    /                      \
                                        (Needs Tool Call)             (Text Only)
                                                |                          |
                                     stop_reason: "tool_use"     stop_reason: "end_turn"
                                                |                          |
                                     content: [tool_use]          content: [text]
                                                |                          |
                                      Dispatch Local Tool          Display Response
```

## Directory Structure

```
.
├── .env.example              # Environment variables template
├── README.md                 # Recipe documentation and execution guide
├── blog-post.md              # Full engineering article
├── curl_probe.sh             # Executable shell script probing tool registration
├── metadata.json             # Post metadata and CMS configuration
├── python/
│   ├── requirements.txt      # Python dependencies (anthropic)
│   └── define_tools.py       # Tool definitions & response parser implementation
└── typescript/
    ├── package.json          # Node.js project manifest
    ├── tsconfig.json         # TypeScript compiler configuration
    └── src/
        └── defineTools.ts    # Typed tool definitions & response parser implementation
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

Test tool registration, `tool_choice` enforcement, and response parsing directly via the Messages API:

```bash
chmod +x curl_probe.sh
./curl_probe.sh
```

### Python Implementation

Install dependencies and run the tool registration demo:

```bash
cd python
pip install -r requirements.txt
python define_tools.py
```

### TypeScript Implementation

Install dependencies, compile, and run the TypeScript implementation:

```bash
cd typescript
npm install
npm run build
npm start
```
