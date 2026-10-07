#!/usr/bin/env bash
# validate-bash.sh — ZeroVPS Autonomous Command Guardrail
# Scans shell commands before agent execution to prevent catastrophic system damage.
set -euo pipefail

CMD_TO_SCAN="${*:-}"

if [[ -z "${CMD_TO_SCAN}" ]]; then
    # Read from stdin if no arguments provided
    CMD_TO_SCAN=$(cat || true)
fi

if [[ -z "${CMD_TO_SCAN}" ]]; then
    echo "[GUARDRAIL ERROR] No command provided to scan." >&2
    exit 1
fi

# Define dangerous command signatures
DANGEROUS_PATTERNS=(
    "rm[[:space:]]+-[rfRF]{2,}[[:space:]]+(/|\*|/\*|~|~/\*|\$HOME)"
    "rm[[:space:]]+-[rfRF]{2,}[[:space:]]+--no-preserve-root"
    "mkfs"
    "dd[[:space:]]+if=.*of=/dev/[shv]d[a-z]"
    ">:?[[:space:]]*/dev/[shv]d[a-z]"
    ":\(\)\{.*:\|:&\};:"
    "chmod[[:space:]]+-R[[:space:]]+[07]{3,4}[[:space:]]+/"
    "cat[[:space:]]+/etc/shadow"
    "pkill[[:space:]]+-9[[:space:]]+-f[[:space:]]+(python|node|bash|docker|systemd)"
    "killall[[:space:]]+-9[[:space:]]+(dockerd|containerd|systemd)"
    "iptables[[:space:]]+-F"
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
    if echo "${CMD_TO_SCAN}" | grep -E -q -i "${pattern}"; then
        echo "🚨 [ZEROVPS GUARDRAIL BLOCKED] Destructive command signature detected!" >&2
        echo "   Pattern matched: ${pattern}" >&2
        echo "   Command: ${CMD_TO_SCAN}" >&2
        echo "   Action: Execution prevented to protect host integrity." >&2
        exit 101
    fi
done

echo "✅ [ZEROVPS GUARDRAIL PASSED] Command verified safe: ${CMD_TO_SCAN}"
exit 0
