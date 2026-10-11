#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
export ROOT
# Helpers import only the standard library. Isolated mode prevents script/cwd
# caches and inherited PYTHONPATH from supplying modules to privileged backups.
read_env() { python3 -I "$ROOT/scripts/config.py" get "$1" "${2:-}"; }
compose() {
  local -a files=(-f "$ROOT/docker-compose.yml")
  if [[ "$(read_env ENABLE_PUBLIC false)" == true ]]; then files+=(-f "$ROOT/compose.public.yml"); fi
  docker compose --project-directory "$ROOT" --env-file "$ROOT/.env" "${files[@]}" "$@"
}
require_tools() { local tool; for tool in "$@"; do command -v "$tool" >/dev/null || { printf 'Required command missing: %s\n' "$tool" >&2; exit 1; }; done; }
