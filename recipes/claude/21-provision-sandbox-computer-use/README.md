# Recipe 21: How to Provision and Sandbox Claude Computer Use

This recipe demonstrates how to provision, configure, and safely sandbox Claude Computer Use (`computer_20250124` / `computer_20241022`) inside isolated virtual desktop containers.

## Overview

Claude Computer Use enables models like Claude 3.7 Sonnet to observe graphical user interfaces and dispatch native input actions:
- `screenshot`: Capture visual state of the display framebuffer.
- `mouse_move`: Reposition cursor across absolute screen coordinates.
- `left_click`, `right_click`, `double_click`, `triple_click`, `middle_click`: Mouse interaction.
- `type`: String text input.
- `key`: Special keys and modifier chords (`Return`, `ctrl+c`, `BackSpace`).
- `cursor_position`: Query current mouse coordinates.

## Architecture

1. **Virtual Desktop Container**: Runs Xvfb (virtual framebuffer), fluxbox (window manager), and xdotool / scrot for headless automation.
2. **Security Gateway**: Intercepts actions before execution. Blocks unauthorized destructive shell commands, enforces network proxy constraints, and routes sensitive actions to human verification gates.
3. **Execution Loop**: Captures screenshots as base64 PNGs and injects them back to Claude via `tool_result` image content blocks.

## Directory Structure

```
.
├── .env.example
├── curl_probe.sh
├── metadata.json
├── README.md
├── blog-post.md
├── python/
│   └── computer_use_orchestrator.py
└── typescript/
    ├── package.json
    └── computer_use_orchestrator.ts
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

### 3. Python Orchestrator

Run the Python implementation:

```bash
python3 python/computer_use_orchestrator.py
```

### 4. TypeScript Orchestrator

Install dependencies and run:

```bash
cd typescript
npm install
npx ts-node computer_use_orchestrator.ts
```

## Security Best Practices

- **Container Isolation**: Never run Computer Use directly on host developer machines. Run inside rootless Docker or Firecracker microVMs.
- **Egress Filtering**: Restrict network egress using Squid forward proxies or iptables rules to whitelist only designated endpoints.
- **Credential Hygiene**: Strip cloud tokens, SSH keys, and secret environment variables from the virtual desktop runtime.
- **Human-in-the-Loop**: Implement approval checkpoints for transactional or destructive operations.
