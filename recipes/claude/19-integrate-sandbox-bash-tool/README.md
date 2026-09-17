# Recipe 19: How to Integrate and Sandbox Claude Bash Tool

This recipe demonstrates how to integrate, execute, and safely sandbox Anthropic's built-in Claude Bash tool (`bash_20250124` / `bash_20241022`) inside isolated subprocess and container runtimes.

## Overview

Claude's built-in bash tool allows models like Claude 3.7 Sonnet to run shell commands to inspect system state, build projects, run tests, and execute scripts:
- `command`: Shell command string dispatched by Claude.
- `restart`: Boolean flag indicating whether to terminate and reinitialize the shell session.

## Architecture & Security Guardrails

1. **Process Isolation**: Commands execute in non-root contexts with strict path traversal boundaries and chroot/container isolation.
2. **Deterministic Timeouts**: Hard timeout caps (e.g. 20-30 seconds) terminate runaway commands and long-running loops.
3. **Output Truncation & Buffer Protection**: Caps stdout and stderr streams at 64 KB to protect LLM context windows from memory exhaustion.
4. **Command Allowlisting & Sanitization**: Prohibits destructive commands (`rm -rf /`, fork bombs, raw block device writes, unauthorized curl/wget network downloads).
5. **Multi-Turn Autonomous Loop**: Formats exit codes, stdout, and stderr into standard `tool_result` content blocks with `is_error` status handling.

## Directory Structure

```
.
├── .env.example
├── curl_probe.sh
├── metadata.json
├── README.md
├── python/
│   ├── requirements.txt
│   └── sandboxed_bash_tool.py
└── typescript/
    ├── package.json
    ├── tsconfig.json
    └── src/
        └── index.ts
```

## Setup & Execution

### 1. Environment Configuration

Copy `.env.example` to `.env` and set your Anthropic API key:

```bash
cp .env.example .env
export ANTHROPIC_API_KEY="your-anthropic-api-key"
```

### 2. cURL Probe

Execute the bash probe to verify tool registration and API connectivity:

```bash
chmod +x curl_probe.sh
./curl_probe.sh
```

### 3. Python Implementation

Run the Python sandboxed bash runner:

```bash
cd python
pip install -r requirements.txt
python sandboxed_bash_tool.py
```

### 4. TypeScript Implementation

Build and execute the TypeScript sandboxed bash runner:

```bash
cd typescript
npm install
npm run build
npm start
```
