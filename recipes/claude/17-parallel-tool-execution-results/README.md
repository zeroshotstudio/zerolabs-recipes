# Recipe 17: How to Handle Parallel Tool Execution and Results

Learn how to handle parallel tool invocations emitted by Claude models, execute multiple tool calls concurrently using Python `asyncio.gather` or TypeScript `Promise.all`, isolate partial execution failures using `is_error: true`, and map responses back to Claude using matching `tool_use_id` content blocks.

## Architecture Overview

```
User Query ---> Claude Messages API
                     |
         [stop_reason: "tool_use"]
                     |
         Multiple ToolUseBlocks Emitted
        [tool_u1]   [tool_u2]   [tool_u3]
            |           |           |
            +-----+-----+-----+-----+
                  |           |
         [asyncio.gather / Promise.all]
                  |           |
            +-----+-----+-----+-----+
            |           |           |
        [Result 1]  [Result 2]  [Error Result]
      (is_error:F) (is_error:F) (is_error:T)
            |           |           |
            +-----+-----+-----+-----+
                  |
     Single User Turn Array:
     [tool_result, tool_result, tool_result]
                  |
         Claude Final Synthesis
```

## Directory Structure

```
.
├── .env.example              # Environment variables template
├── README.md                 # Recipe documentation and execution guide
├── blog-post.md              # Full engineering article
├── curl_probe.sh             # Executable shell script probing parallel tool execution
├── metadata.json             # Post metadata and CMS configuration
├── python/
│   ├── requirements.txt      # Python dependencies (anthropic, pydantic)
│   └── parallel_tools.py     # Python concurrent tool execution with asyncio.gather
└── typescript/
    ├── package.json          # Node.js project manifest
    ├── tsconfig.json         # TypeScript compiler configuration
    └── src/
        └── parallelTools.ts  # TypeScript concurrent execution with Promise.all
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

Test parallel tool invocations and multi-turn resolution directly via the Messages API:

```bash
chmod +x curl_probe.sh
./curl_probe.sh
```

### Python Implementation

Install dependencies and run concurrent tool execution via `asyncio`:

```bash
cd python
pip install -r requirements.txt
python parallel_tools.py
```

### TypeScript Implementation

Install dependencies, compile, and execute concurrent tool execution via `Promise.all`:

```bash
cd typescript
npm install
npm run start
```
