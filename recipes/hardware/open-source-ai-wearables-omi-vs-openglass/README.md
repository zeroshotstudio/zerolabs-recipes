# Open-Source AI Wearables: Omi vs. OpenGlass — ZeroLabs Companion Recipe

> **Canonical Teardown & Bench Analysis:** [Open-Source AI Wearables: Omi vs OpenGlass](https://labs.zeroshot.studio/hardware/open-source-ai-wearables-omi-vs-openglass?utm_source=github&utm_medium=repo&utm_campaign=open-source-ai-wearables-omi-vs-openglass)

This recipe provides a zero-cloud local Bluetooth Low Energy (BLE) subscriber that pairs with open-source AI wearables ([Omi](https://github.com/BasedHardware/omi) or OpenGlass) and captures raw audio streams or camera snapshots directly to your local workstation.

## Quick Start

### 1. Prerequisites
- Python 3.10+
- Bluetooth 4.0+ adapter with BLE support

### 2. Setup Environment
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

### 3. Run BLE Relay
```bash
python3 starter.py
```

## Architecture & Hardware Specs
For detailed power draw comparisons (Otii Arc test bench), full bills of materials, and deep sleep measurements, read the complete teardown at [ZeroLabs](https://labs.zeroshot.studio/hardware/open-source-ai-wearables-omi-vs-openglass?utm_source=github&utm_medium=repo&utm_campaign=open-source-ai-wearables-omi-vs-openglass).

---
*Maintained by [ZeroShot Studio](https://zeroshot.studio) & the ZeroLabs Team.*
