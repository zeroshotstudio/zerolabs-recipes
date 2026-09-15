# Edge TPU vs Hailo-8: Low-Power Local Neural Accelerators for Autonomous Dev Hardware — ZeroLabs Companion Recipe

> **Canonical Teardown & Deep Dive:** [Edge TPU vs Hailo-8: Low-Power Local Neural Accelerators for Autonomous Dev Hardware](https://labs.zeroshot.studio/vps-infra/edge-tpu-vs-hailo8-local-neural-accelerators?utm_source=github&utm_medium=repo&utm_campaign=edge-tpu-vs-hailo8-local-neural-accelerators)

This directory contains the reproducible code companion and starter configuration for the ZeroLabs technical brief: **"Edge TPU vs Hailo-8: Low-Power Local Neural Accelerators for Autonomous Dev Hardware"**.

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
For full architectural diagrams, failure mode analyses, and benchmark data, read the complete intelligence brief at [ZeroLabs](https://labs.zeroshot.studio/vps-infra/edge-tpu-vs-hailo8-local-neural-accelerators?utm_source=github&utm_medium=repo&utm_campaign=edge-tpu-vs-hailo8-local-neural-accelerators).

---
*Maintained by [ZeroShot Studio](https://zeroshot.studio) & the ZeroLabs Team.*
