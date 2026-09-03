# How I'm Learning German by Talking to My Coding AI — ZeroLabs Companion Recipe

> **Canonical Architecture Teardown:** [How I'm Learning German by Talking to My Coding AI](https://labs.zeroshot.studio/ai-workflows/learn-german-passively-ai-coding-assistant?utm_source=github&utm_medium=repo&utm_campaign=learn-german-passively-ai-coding-assistant)  
> **Source Platform:** [ZeroLabs Intelligence Briefs](https://labs.zeroshot.studio)

This directory contains the production-tested companion skill configuration and verification test harness for **"How I'm Learning German by Talking to My Coding AI"**.

## Overview

The ZeroDeutsch skill transforms routine AI coding sessions in Claude Code, Cursor, and OpenClaw into passive German language immersion:
- **Rule 1 (Noun-Gender Pairing):** Every German noun introduced is strictly paired with its definite article (`der`, `die`, `das`).
- **Rule 2 (Code Isolation):** All code, variable identifiers, terminal syntax, and commit messages remain 100% standard English.
- **Rule 3 (Conversational Weaving):** Status messages, phase transitions, and brief acknowledgments progressively integrate German vocabulary.
- **Rule 4 (Toggle Control):** Instantly activate with `"Deutsch an"` and disable with `"Deutsch aus"`.

---

## Files in this Recipe

- [`zerodeutsch.md`](./.claudecode/skills/zerodeutsch.md): Complete skill definition file ready for Claude Code, Cursor, or OpenClaw.
- [`test_zerodeutsch.py`](./test_zerodeutsch.py): Automated test suite verifying trigger activation, article pairing, and code isolation rules.
- [`.env.example`](./.env.example): Environment configuration template.

---

## Installation & Quick Start

### 1. Claude Code
Copy the skill file into your project or user skills directory:
```bash
mkdir -p ~/.claude/skills
cp .claudecode/skills/zerodeutsch.md ~/.claude/skills/zerodeutsch.md
```

### 2. Verify with Test Harness
Run the automated verification suite:
```bash
python3 test_zerodeutsch.py
```

### 3. Usage
In your AI assistant prompt, type:
```text
Deutsch an
```
To pause German immersion at any time:
```text
Deutsch aus
```
