#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
require_tools docker python3 flock
umask 077
mkdir -p "$ROOT/backups" "$ROOT/state"
chmod 0700 "$ROOT/backups"
chmod 0755 "$ROOT/state"
exec 9>"$ROOT/backups/.backup.lock"
flock -n 9 || { echo 'A backup is already running' >&2; exit 1; }
TMP="$(mktemp -d "$ROOT/backups/.pending.XXXXXXXX")"
SUCCESS=false
cleanup() {
  local rc=$?
  rm -rf -- "$TMP"
  if [[ "$SUCCESS" != true ]]; then
    python3 "$ROOT/scripts/archives.py" failed "$ROOT/state/backup-status.json" || true
    echo 'Backup failed. Existing backups were retained.' >&2
    [[ "$rc" -ne 0 ]] || rc=1
  fi
  exit "$rc"
}
trap cleanup EXIT
compose exec -T postgres sh -ec 'pg_dump --format=custom --no-owner --no-acl -U agent_admin -d "$POSTGRES_DB"' > "$TMP/database.dump"
[[ -s "$TMP/database.dump" ]] || { echo 'Database dump is empty' >&2; exit 1; }
compose exec -T postgres pg_restore --list < "$TMP/database.dump" >/dev/null
ARCHIVE="$(python3 "$ROOT/scripts/archives.py" pack "$TMP/database.dump" "$ROOT/backups")"
REMOTE="$(read_env BACKUP_REMOTE)"
OFFSITE='not configured'
if [[ -n "$REMOTE" ]]; then
  require_tools rclone
  rclone copyto "$ARCHIVE" "${REMOTE%/}/$(basename "$ARCHIVE")"
  # Download-and-hash verification works for remotes without comparable native hashes.
  rclone cat "${REMOTE%/}/$(basename "$ARCHIVE")" | python3 "$ROOT/scripts/archives.py" compare "$ARCHIVE"
  OFFSITE=verified
fi
python3 "$ROOT/scripts/archives.py" status "$ARCHIVE" "$ROOT/state/backup-status.json" "$OFFSITE"
python3 "$ROOT/scripts/archives.py" prune "$ROOT/backups" "$(read_env BACKUP_KEEP 14)"
SUCCESS=true
printf 'Verified backup: %s\nOffsite: %s\n' "$ARCHIVE" "$OFFSITE"
