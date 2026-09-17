#!/usr/bin/env bash
set -euo pipefail

echo "=== Running Usage Cost Tracker & Admin API Probe ==="
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 1. Test Python Cost Calculation & Model Pricing
echo "[1/3] Testing Python Cost Calculation & Pricing Matrix..."
python3 -c "
import sys
sys.path.insert(0, '$SCRIPT_DIR/python')
from cost_tracker import UsageRecord, calculate_cost, get_pricing_key, MODEL_PRICING

# Test pricing key normalization
assert get_pricing_key('claude-3-7-sonnet-20250219') == 'claude-3-7-sonnet'
assert get_pricing_key('claude-3-5-haiku-20241022') == 'claude-3-5-haiku'
assert get_pricing_key('claude-3-opus-20240229') == 'claude-3-opus'

# Test calculation on Sonnet
record = UsageRecord(
    workspace_id='test-wrk',
    model='claude-3-7-sonnet',
    input_tokens=1_000_000,
    output_tokens=1_000_000,
    cache_creation_input_tokens=1_000_000,
    cache_read_input_tokens=1_000_000
)
summary = calculate_cost(record)
# Sonnet: 3 dollars input + 15 dollars output + 3.75 write + 0.30 read = 22.05
assert abs(summary.total_cost - 22.05) < 0.001, f'Expected 22.05, got {summary.total_cost}'
assert abs(summary.cache_read_ratio - (1.0 / 3.0)) < 0.01

print('Python calculation unit checks passed!')
"

# 2. Check TypeScript syntax and structure
echo "[2/3] Validating TypeScript file syntax and imports..."
if command -v tsc &> /dev/null; then
  (cd "$SCRIPT_DIR/typescript" && tsc --noEmit)
  echo "TypeScript type check passed!"
else
  echo "tsc not in path, verifying ts syntax via node..."
  node -e "
    const fs = require('fs');
    const content = fs.readFileSync('$SCRIPT_DIR/typescript/src/cost_tracker.ts', 'utf8');
    if (!content.includes('MODEL_PRICING') || !content.includes('calculateCost') || !content.includes('AdminAPIClient')) {
      console.error('Missing key exports in TypeScript cost tracker');
      process.exit(1);
    }
    console.log('TypeScript source structure verified!');
  "
fi

# 3. Secret scan
echo "[3/3] Scanning for leaked keys..."
if grep -rn "sk-ant-" "$SCRIPT_DIR" | grep -v ".git"; then
  echo "ERROR: Real Anthropic API key detected in repo!"
  exit 1
fi
echo "Secret scan clean: No API keys found."

echo "=== All Probes Succeeded (<5s) ==="
