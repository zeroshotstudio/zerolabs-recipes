# Gemini 3.8 text-to-speech says hello — ZeroLabs Companion Recipe

> **Canonical Teardown & Deep Dive:** [Gemini 3.8 text-to-speech says hello](https://labs.zeroshot.studio/news/gemini-38-text-to-speech-says-hello?utm_source=github&utm_medium=repo&utm_campaign=gemini-38-text-to-speech-says-hello)

This directory contains the reproducible code companion and starter configuration for the ZeroLabs technical brief: **"Gemini 3.8 text-to-speech says hello"**.

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
For full architectural diagrams, failure mode analyses, and benchmark data, read the complete intelligence brief at [ZeroLabs](https://labs.zeroshot.studio/news/gemini-38-text-to-speech-says-hello?utm_source=github&utm_medium=repo&utm_campaign=gemini-38-text-to-speech-says-hello).

---
*Maintained by [ZeroShot Studio](https://zeroshot.studio) & the ZeroLabs Team.*
