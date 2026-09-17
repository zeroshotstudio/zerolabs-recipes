# Claude Recipes: How to Optimize Token Costs with 1-Hour Ephemeral Cache

Companion code repository for the ZeroLabs technical guide: [How to Optimize Token Costs with 1-Hour Ephemeral Cache](https://labs.zeroshot.studio/resources/how-to-optimize-token-costs-with-1-hour-ephemeral-cache).

## Contents

- `curl_probe.sh`: Bash probe script measuring prompt cache creation, cache hit latency, and renewal verification against the Anthropic Messages API.
- `python/cost_model.py`: Financial model calculating unit economics, break-even thresholds, amortized cost per request, and live multi-turn cache evaluation.
- `typescript/costModel.ts`: TypeScript counterpart with strict type definitions and token economics formulas.
- `metadata.json`: Recipe metadata and taxonomy tags.
- `.env.example`: Environment variable template.

## Quickstart

### 1. Configure Environment

```bash
cp .env.example .env
export ANTHROPIC_API_KEY="sk-ant-api03-your-key-here"
```

### 2. Run Executable cURL Probe

```bash
chmod +x curl_probe.sh
./curl_probe.sh
```

### 3. Run Python Cost Simulation

```bash
python3 python/cost_model.py
```

### 4. Run TypeScript Cost Simulation

```bash
npx tsx typescript/costModel.ts
```
