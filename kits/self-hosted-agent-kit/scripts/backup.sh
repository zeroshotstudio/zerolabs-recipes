#!/usr/bin/env bash
# backup.sh — Zero-downtime backup script for Agent Stack Postgres & Redis
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Source .env if present
if [[ -f "${STACK_DIR}/.env" ]]; then
    set -a
    source "${STACK_DIR}/.env"
    set +a
fi

BACKUP_DIR="${BACKUP_DIR:-${STACK_DIR}/backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RETENTION_DAYS=7
DB_USER="${POSTGRES_USER:-agent}"

mkdir -p "${BACKUP_DIR}"

echo "[BACKUP] Starting backup at $(date)..."

# 1. PostgreSQL dump via docker exec
if docker ps --format '{{.Names}}' | grep -q "^agent-postgres$"; then
    echo "[BACKUP] Dumping PostgreSQL..."
    docker exec agent-postgres pg_dumpall -U "${DB_USER}" | gzip > "${BACKUP_DIR}/postgres_${TIMESTAMP}.sql.gz"
    echo "[BACKUP] Postgres backup saved to ${BACKUP_DIR}/postgres_${TIMESTAMP}.sql.gz"
fi

# 2. Redis RDB snapshot
if docker ps --format '{{.Names}}' | grep -q "^agent-redis$"; then
    echo "[BACKUP] Triggering Redis BGSAVE..."
    docker exec agent-redis redis-cli -a "${REDIS_PASSWORD:-}" bgsave || true
    sleep 2
    # Copy RDB directly from container volume if needed
    docker exec agent-redis cat /data/dump.rdb > "${BACKUP_DIR}/redis_${TIMESTAMP}.rdb" 2>/dev/null || true
    if [[ -s "${BACKUP_DIR}/redis_${TIMESTAMP}.rdb" ]]; then
        echo "[BACKUP] Redis snapshot saved to ${BACKUP_DIR}/redis_${TIMESTAMP}.rdb"
    else
        rm -f "${BACKUP_DIR}/redis_${TIMESTAMP}.rdb"
    fi
fi

# 3. Prune old backups older than 7 days
echo "[BACKUP] Pruning backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -type f -name "*.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
find "${BACKUP_DIR}" -type f -name "*.rdb" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true

echo "[BACKUP] Completed successfully at $(date)."
