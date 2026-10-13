#!/usr/bin/env bash
# Install from either an extracted release or a checkout. Never copy an existing .env.
set -Eeuo pipefail
umask 077
SOURCE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
DEST=/opt/agentkit
START=true
TIMERS=true
while (($#)); do
  case "$1" in
    --dest) DEST="${2:?--dest needs a directory}"; shift 2 ;;
    --no-start) START=false; shift ;;
    --no-timer) TIMERS=false; shift ;;
    *) printf 'Usage: %s [--dest /opt/agentkit] [--no-start] [--no-timer]\n' "$0" >&2; exit 2 ;;
  esac
done
command -v python3 >/dev/null || { echo 'Install python3 first' >&2; exit 1; }
if [[ "$START" == true ]]; then
  command -v docker >/dev/null || { echo 'Install Docker Engine and Compose v2 first: https://docs.docker.com/engine/install/' >&2; exit 1; }
  docker info >/dev/null
  docker compose version --short | python3 -I -c 'import re,sys; m=re.match(r"v?(\d+)\.(\d+)\.(\d+)",sys.stdin.read()); assert m and tuple(map(int,m.groups())) >= (2,24,4), "Docker Compose 2.24.4 or newer is required"'
  command -v flock >/dev/null || { echo 'Install util-linux (flock) before starting the kit.' >&2; exit 1; }
fi
# The verified source is trusted operator input. Atomically copy package files as
# this account; a root install must never preserve the download owner's access.
# This also secures existing/same-directory installs before running their helpers.
DEST="$(python3 -I "$SOURCE/scripts/install-files.py" "$SOURCE" "$DEST")"
export ROOT="$DEST"
python3 -I "$DEST/scripts/config.py" init
chmod 0755 "$DEST" "$DEST/app" "$DEST/app/public" "$DEST/docs"
mkdir -p "$DEST/backups" "$DEST/state"
chmod 0700 "$DEST/backups"
chmod 0755 "$DEST/state"
find "$DEST/scripts" -maxdepth 1 -name '*.sh' -exec chmod 0755 {} +
# State contains a non-secret backup summary readable by the unprivileged API.
if [[ "$TIMERS" == true ]]; then
  if [[ "$EUID" -eq 0 ]] && command -v systemctl >/dev/null && [[ -d /run/systemd/system ]]; then
    [[ "$DEST" != *[$'\n\r%"\\']* ]] || { echo 'Installation path contains unsupported systemd characters' >&2; exit 1; }
    python3 -I - "$SOURCE" "$DEST" <<'PY'
import pathlib, sys
source, dest = map(pathlib.Path, sys.argv[1:])
for name in ['agentkit-backup.service','agentkit-backup.timer']:
    text = (dest/'systemd'/name).read_text().replace('@INSTALL_DIR@', str(dest))
    (pathlib.Path('/etc/systemd/system')/name).write_text(text)
PY
    systemctl daemon-reload
    systemctl enable --now agentkit-backup.timer
  else
    echo 'Backup timer was not installed: run setup as root on a systemd host, or schedule scripts/backup.sh daily.'
  fi
fi
if [[ "$START" == true ]]; then
  source "$DEST/scripts/lib.sh"
  compose up -d --build --wait --wait-timeout 180
  echo 'Workspace started. Run ./scripts/status.sh for readiness.'
fi
printf 'Installed at %s\nAccess: use the PUBLIC_ORIGIN in .env (private by default).\nOperator key: read ADMIN_TOKEN from the protected .env on your host.\nNext: run scripts/backup.sh and rehearse scripts/restore.sh.\n' "$DEST"
