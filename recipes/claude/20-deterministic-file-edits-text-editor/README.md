# Recipe 20: How to Execute Deterministic File Edits with Text Editor Tool

Execute deterministic, idempotent file edits with Claude using Anthropic's native text editor tool (`type: "text_editor_20250124"`). Implement the five core editing primitives (`view`, `create`, `str_replace`, `insert`, and `undo_edit`), enforce strict unique substring matching, maintain bounded undo stacks, and handle client execution loops in Python and TypeScript.

## Architecture Overview

```
User Edit Goal ---> Claude Messages API ---> stop_reason: "tool_use"
                                                     |
                                         [Text Editor Dispatch]
                                         /         |          \
                                  (view)     (str_replace)    (insert/create/undo)
                                    |              |                   |
                           Read Range &      Verify Unique        Mutate File &
                           Format Lines      Exact Match          Push Undo Stack
                                    \              |                  /
                                     \             |                 /
                                    Return tool_result ({ is_error })
                                                   |
                                     Claude Evaluates Outcome
                                                   |
                                    [Edits Complete / Verified?]
                                      /                        \
                                    (No)                      (Yes)
                                     |                          |
                             Iterate Next Turn            stop_reason: "end_turn"
```

## Directory Structure

```
.
├── .env.example              # Environment variables template
├── README.md                 # Recipe documentation and execution guide
├── blog-post.md              # Complete engineering article
├── curl_probe.sh             # Executable shell script probing text editor tool turns
├── metadata.json             # Post metadata and CMS configuration
├── python/
│   ├── requirements.txt      # Python dependencies
│   ├── text_editor_backend.py# Full text editor backend with history stack
│   └── main.py               # Agent loop and simulation driver
└── typescript/
    ├── package.json          # Node.js project manifest
    ├── tsconfig.json         # TypeScript compiler configuration
    └── src/
        └── index.ts          # TypeScript text editor backend and agent loop
```

## Prerequisites

- Python 3.10+ or Node.js 18+
- Active Anthropic API key (optional for offline test simulation)

```bash
cp .env.example .env
export ANTHROPIC_API_KEY="sk-ant-api03-..."
```

## Quickstart

### cURL Probe

Probe the raw Messages API with text editor tool definitions and multi-turn exchanges:

```bash
chmod +x curl_probe.sh
./curl_probe.sh
```

### Python Implementation

Run the deterministic text editor backend and multi-turn simulation:

```bash
cd python
python3 text_editor_backend.py
python3 main.py
```

### TypeScript Implementation

Run the TypeScript editor implementation:

```bash
cd typescript
npm install
npm run start
```
