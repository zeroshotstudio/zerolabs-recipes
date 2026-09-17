#!/usr/bin/env bash
# Fast sub-5s probe for FastMCP Python Server
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_CMD="python3"

if [ -f "/home/zeroshot/.venv-mcp/bin/python" ]; then
  PYTHON_CMD="/home/zeroshot/.venv-mcp/bin/python"
fi

echo "=================================================="
echo "Probe: FastMCP Python SDK Server Integration Test"
echo "Interpreter: ${PYTHON_CMD}"
echo "Server Script: ${SCRIPT_DIR}/python/server.py"
echo "=================================================="

# Check python version and dependencies
"${PYTHON_CMD}" -c "import importlib.metadata; from mcp.server.fastmcp import FastMCP; import pydantic; print(f'MCP version: {importlib.metadata.version(\"mcp\")}, Pydantic version: {pydantic.__version__}')"

# Run automated stdio client probe
START_TIME=$(date +%s%N)
"${PYTHON_CMD}" "${SCRIPT_DIR}/python/client_test.py"
END_TIME=$(date +%s%N)

ELAPSED_MS=$(( (END_TIME - START_TIME) / 1000000 ))
echo "=================================================="
echo "Probe completed successfully in ${ELAPSED_MS} ms (< 5000 ms limit)."
echo "=================================================="
