#!/usr/bin/env bash
# backup.sh — Zero-downtime backup script for Agent Stack Postgres & Redis
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/agent-stack/backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RETENTION_DAYS=7

mkdir -p "${BACKUP_DIR}"

echo "[BACKUP] Starting backup at $(date)..."

# 1. PostgreSQL dump via docker exec
if docker ps --format '{{.Names}}' | grep -q "^agent-postgres$"; then
    echo "[BACKUP] Dumping PostgreSQL..."
    docker exec agent-postgres pg_dumpall -U agent | gzip > "${BACKUP_DIR}/postgres_${TIMESTAMP}.sql.gz"
    echo "[BACKUP] Postgres backup saved to ${BACKUP_DIR}/postgres_${TIMESTAMP}.sql.gz"
fi

# 2. Redis RDB snapshot
if docker ps --format '{{.Names}}' | grep -q "^agent-redis$"; then
    echo "[BACKUP] Triggering Redis BGSAVE..."
    docker exec agent-redis redis-cli -a "${REDIS_PASSWORD:-}" bgsave || true
    sleep 2
    if [[ -f "/opt/agent-stack/data/redis/dump.rdb" ]]; then
        cp "/opt/agent-stack/data/redis/dump.rdb" "${BACKUP_DIR}/redis_${TIMESTAMP}.rdb"
    fi
fi

# 3. Prune old backups older than 7 days
echo "[BACKUP] Pruning backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -type f -name "*.gz" -mtime +${RETENTION_DAYS} -delete
find "${BACKUP_DIR}" -type f -name "*.rdb" -mtime +${RETENTION_DAYS} -delete

echo "[BACKUP] Completed successfully at $(date)."
