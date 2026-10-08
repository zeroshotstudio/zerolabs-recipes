#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
require_tools docker python3 flock
umask 077
[[ $# -eq 1 ]] || { echo 'Usage: scripts/restore.sh /path/to/agentkit-TIMESTAMP.tar.gz (clean workspace only)' >&2; exit 2; }
ARCHIVE="$(realpath -- "$1")"
mkdir -p "$ROOT/backups"
exec 9>"$ROOT/backups/.backup.lock"
flock -n 9 || { echo 'A backup or restore is already running' >&2; exit 1; }
TMP="$(mktemp -d)"
trap 'rm -rf -- "$TMP"' EXIT
python3 "$ROOT/scripts/archives.py" verify "$ARCHIVE" "$TMP/database.dump" >/dev/null
compose up -d --wait postgres
compose run --rm --no-deps migrate
COUNT="$(compose exec -T postgres sh -ec 'psql -X -v ON_ERROR_STOP=1 -U agent_admin -d "$POSTGRES_DB" -Atc "SELECT (SELECT count(*) FROM jobs)+(SELECT count(*) FROM documents)+(SELECT count(*) FROM api_tokens);"')"
[[ "$COUNT" == 0 ]] || { echo "Restore refused: destination contains tasks, documents or tokens. Use a clean installation." >&2; exit 1; }
ACTIVE=()
while IFS= read -r service; do
  [[ "$service" == api || "$service" == worker ]] && ACTIVE+=("$service")
done < <(compose ps --status running --services)
compose stop worker api
COUNT="$(compose exec -T postgres sh -ec 'psql -X -v ON_ERROR_STOP=1 -U agent_admin -d "$POSTGRES_DB" -Atc "SELECT (SELECT count(*) FROM jobs)+(SELECT count(*) FROM documents)+(SELECT count(*) FROM api_tokens);"')"
if [[ "$COUNT" != 0 ]]; then
  if ((${#ACTIVE[@]})); then compose up -d --no-recreate --no-deps --wait --wait-timeout 60 "${ACTIVE[@]}"; fi
  echo 'Restore refused: destination contains tasks, documents or tokens. Restore into a separate clean installation.' >&2
  exit 1
fi
compose exec -T postgres pg_restore --list < "$TMP/database.dump" >/dev/null
# Atomic transaction: a failed restore cannot leave a half-restored database.
compose exec -T postgres sh -ec 'pg_restore --single-transaction --exit-on-error --clean --if-exists --no-owner --no-acl -U agent_admin -d "$POSTGRES_DB"' < "$TMP/database.dump"
compose run --rm --no-deps migrate
compose exec -T postgres sh -ec 'psql -X -v ON_ERROR_STOP=1 -U agent_admin -d "$POSTGRES_DB"' <<'SQL'
BEGIN;
DELETE FROM sessions;
DELETE FROM api_tokens;
DELETE FROM workers;
UPDATE jobs SET status='failed',error='Interrupted by backup recovery. Review before retrying.',finished_at=now(),lease_until=NULL WHERE status IN ('running','queued');
INSERT INTO audit_log(actor,action) VALUES('restore','recovery.completed');
COMMIT;
SQL
compose up -d --wait --wait-timeout 120
printf 'Restore completed. Sessions and API tokens were revoked. Sign in, review recovered tasks and documents, and run a system check.\n'
