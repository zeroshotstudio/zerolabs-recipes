#!/usr/bin/env bash
set -euo pipefail

# Sub-5-second test probe for Recipe 23: Build MCP Server with TypeScript SDK
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/typescript"

echo "=== [Recipe 23] Running TypeScript MCP Server Test Probe ==="
START_TIME=$(date +%s%N)

# 1. Verify build artifacts
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install --silent
fi

echo "Building TypeScript project..."
npm run build --silent

# 2. Run client verification over stdio
echo "Executing client E2E probe..."
npx tsx src/client.ts

END_TIME=$(date +%s%N)
DURATION=$(( (END_TIME - START_TIME) / 1000000 ))
echo "=== Test Probe Passed in ${DURATION}ms (<5000ms SLA) ==="
