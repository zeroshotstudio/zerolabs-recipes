# The 0 MB Idle Daemon: Benchmarking Local SLMs and Taming Apple Silicon MLX — ZeroLabs Companion Recipe

> **Canonical Teardown & Deep Dive:** [The 0 MB Idle Daemon: Benchmarking Local SLMs and Taming Apple Silicon MLX](https://labs.zeroshot.studio/ai-workflows/local-slm-triage-benchmark-mlx-sentinel?utm_source=github&utm_medium=repo&utm_campaign=local-slm-triage-benchmark-mlx-sentinel)

This directory contains the reproducible code companion and starter configuration for the ZeroLabs technical brief: **"The 0 MB Idle Daemon: Benchmarking Local SLMs and Taming Apple Silicon MLX"**.

## Components

- `mlx_sentinel.py`: Pure Python process group supervisor and HTTP reverse proxy that manages `mlx_lm.server` with dynamic cold-start and automatic 10-minute idle memory eviction.
- `com.zeroshot.mlx-sentinel.plist.example`: Hardened macOS `launchd` service definition with `ThrottleInterval` and conditional crash restarts to eliminate respawn storms.
- `.env.example`: Environment configuration template.

## Quick Start

### 1. Prerequisites
- macOS on Apple Silicon (M1/M2/M3/M4)
- Python 3.11+
- `mlx-lm` (`pip install mlx-lm`)

### 2. Setup Environment
```bash
cp .env.example .env
```

### 3. Run MLX Sentinel Directly
```bash
python3 mlx_sentinel.py
```

Test the health endpoint:
```bash
curl http://127.0.0.1:8080/health
```

Send a test chat completion (triggers on-demand cold-start):
```bash
curl http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mlx-community/Llama-3.2-3B-Instruct-4bit",
    "messages": [{"role": "user", "content": "Return valid JSON with key status: ok"}],
    "max_tokens": 128
  }'
```

### 4. Install Hardened launchd Service
```bash
cp com.zeroshot.mlx-sentinel.plist.example ~/Library/LaunchAgents/com.zeroshot.mlx-sentinel.plist
# Edit paths to point to your Python binary and mlx_sentinel.py location
launchctl load ~/Library/LaunchAgents/com.zeroshot.mlx-sentinel.plist
```

## Architecture & Workflow Details
For full architectural diagrams, failure mode analyses, and benchmark data, read the complete intelligence brief at [ZeroLabs](https://labs.zeroshot.studio/ai-workflows/local-slm-triage-benchmark-mlx-sentinel?utm_source=github&utm_medium=repo&utm_campaign=local-slm-triage-benchmark-mlx-sentinel).

---
*Maintained by [ZeroShot Studio](https://zeroshot.studio) & the ZeroLabs Team.*
