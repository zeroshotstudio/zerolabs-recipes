#!/usr/bin/env bash
# validate-db-safety.sh — ZeroVPS Database Mutation Guardrail
# Prevents accidental DROP TABLE, TRUNCATE, or unindexed bulk drops by autonomous agents.
set -euo pipefail

SQL_QUERY="${*:-}"

if [[ -z "${SQL_QUERY}" ]]; then
    SQL_QUERY=$(cat || true)
fi

if [[ -z "${SQL_QUERY}" ]]; then
    echo "[GUARDRAIL ERROR] No SQL statement provided to scan." >&2
    exit 1
fi

DESTRUCTIVE_SQL_PATTERNS=(
    "DROP[[:space:]]+DATABASE"
    "DROP[[:space:]]+TABLE"
    "DROP[[:space:]]+SCHEMA"
    "TRUNCATE[[:space:]]+TABLE"
    "TRUNCATE[[:space:]]+"
    "DELETE[[:space:]]+FROM[[:space:]]+[a-zA-Z0-9_]+[[:space:]]*;?$"
)

for pattern in "${DESTRUCTIVE_SQL_PATTERNS[@]}"; do
    if echo "${SQL_QUERY}" | grep -E -q -i "${pattern}"; then
        if [[ "${ALLOW_DESTRUCTIVE_DB:-0}" != "1" ]]; then
            echo "🚨 [ZEROVPS DB GUARDRAIL BLOCKED] Destructive SQL operation detected!" >&2
            echo "   Query matched: ${pattern}" >&2
            echo "   SQL: ${SQL_QUERY}" >&2
            echo "   Action: Query blocked. To override explicitly, export ALLOW_DESTRUCTIVE_DB=1." >&2
            exit 102
        else
            echo "⚠️ [ZEROVPS DB GUARDRAIL WARN] Destructive SQL permitted by explicit ALLOW_DESTRUCTIVE_DB=1 override."
        fi
    fi
done

echo "✅ [ZEROVPS DB GUARDRAIL PASSED] SQL query verified safe."
exit 0
