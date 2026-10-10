#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
[[ $# -eq 1 && -f "$1/scripts/setup.sh" ]] || { echo 'Usage: scripts/update.sh /path/to/verified-extracted-new-release' >&2; exit 2; }
NEW="$(cd -- "$1" && pwd -P)"
[[ "$NEW" != "$ROOT" ]] || { echo 'Extract the update in a separate directory first.' >&2; exit 1; }
"$ROOT/scripts/backup.sh"
# New releases must document schema compatibility. Retain the old extracted release
# and .env; database rollback requires restoring the matching pre-update backup.
bash "$NEW/scripts/setup.sh" --dest "$ROOT"
