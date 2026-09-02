# The 2026 Model Context Protocol (MCP) Cheatsheet: Servers, SSE Transports, and Schemas — ZeroLabs Companion Recipe

> **Canonical Teardown & Deep Dive:** [The 2026 Model Context Protocol (MCP) Cheatsheet: Servers, SSE Transports, and Schemas](https://labs.zeroshot.studio/resources/full-stack-mcp-cheatsheet?utm_source=github&utm_medium=repo&utm_campaign=full-stack-mcp-cheatsheet)

This directory contains the reproducible code companion and starter configuration for the ZeroLabs technical brief: **"The 2026 Model Context Protocol (MCP) Cheatsheet: Servers, SSE Transports, and Schemas"**.

## Quick Start

### 1. Prerequisites
- Docker & Docker Compose
- Python 3.11+
- Node.js 20+ (if frontend component included)

### 2. Setup Environment
```bash
cp .env.example .env
# Edit .env with your environment variables
```

### 3. Run Starter
```bash
docker compose up -d
# or run standalone python script
python3 starter.py
```

## Architecture & Workflow Details
For full architectural diagrams, failure mode analyses, and benchmark data, read the complete intelligence brief at [ZeroLabs](https://labs.zeroshot.studio/resources/full-stack-mcp-cheatsheet?utm_source=github&utm_medium=repo&utm_campaign=full-stack-mcp-cheatsheet).

---
*Maintained by [ZeroShot Studio](https://zeroshot.studio) & the ZeroLabs Team.*
