#!/usr/bin/env bash
# validate-backup-freshness.sh — ZeroVPS Backup Freshness Guardrail
# Verifies that a valid database snapshot exists within the last 24 hours before risky operations.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-${STACK_DIR}/backups}"
MAX_AGE_HOURS=24

if [[ ! -d "${BACKUP_DIR}" ]]; then
    echo "🚨 [ZEROVPS BACKUP GUARDRAIL BLOCKED] Backup directory does not exist: ${BACKUP_DIR}" >&2
    echo "   Action: Run ./scripts/backup.sh first before executing risky system updates." >&2
    exit 103
fi

LATEST_BACKUP=$(find "${BACKUP_DIR}" -type f -name "postgres_*.sql.gz" -o -name "postgres_*.sql" | sort | tail -n 1)

if [[ -z "${LATEST_BACKUP}" ]]; then
    echo "🚨 [ZEROVPS BACKUP GUARDRAIL BLOCKED] No database backups found in ${BACKUP_DIR}!" >&2
    echo "   Action: Execute ./scripts/backup.sh to capture initial database state." >&2
    exit 104
fi

# Check file modification time in hours
BACKUP_MTIME=$(stat -c %Y "${LATEST_BACKUP}" 2>/dev/null || stat -f %m "${LATEST_BACKUP}")
CURRENT_TIME=$(date +%s)
AGE_HOURS=$(( (CURRENT_TIME - BACKUP_MTIME) / 3600 ))

if [[ ${AGE_HOURS} -ge ${MAX_AGE_HOURS} ]]; then
    echo "⚠️ [ZEROVPS BACKUP GUARDRAIL STALE] Latest backup is ${AGE_HOURS} hours old (> ${MAX_AGE_HOURS}h threshold)!" >&2
    echo "   File: ${LATEST_BACKUP}" >&2
    echo "   Action: Refresh backup before proceeding: ./scripts/backup.sh" >&2
    exit 105
fi

echo "✅ [ZEROVPS BACKUP GUARDRAIL PASSED] Fresh backup verified (${AGE_HOURS}h old): $(basename "${LATEST_BACKUP}")"
exit 0
