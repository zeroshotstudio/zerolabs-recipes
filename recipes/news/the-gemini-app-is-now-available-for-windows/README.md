# The Gemini app is now available for Windows — ZeroLabs Companion Recipe

> **Canonical Teardown & Deep Dive:** [The Gemini app is now available for Windows](https://labs.zeroshot.studio/news/the-gemini-app-is-now-available-for-windows?utm_source=github&utm_medium=repo&utm_campaign=the-gemini-app-is-now-available-for-windows)

This directory contains the reproducible code companion and starter configuration for the ZeroLabs technical brief: **"The Gemini app is now available for Windows"**.

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
For full architectural diagrams, failure mode analyses, and benchmark data, read the complete intelligence brief at [ZeroLabs](https://labs.zeroshot.studio/news/the-gemini-app-is-now-available-for-windows?utm_source=github&utm_medium=repo&utm_campaign=the-gemini-app-is-now-available-for-windows).

---
*Maintained by [ZeroShot Studio](https://zeroshot.studio) & the ZeroLabs Team.*
