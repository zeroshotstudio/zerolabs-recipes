#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
require_tools tailscale python3 docker
[[ "$(read_env ENABLE_PUBLIC false)" != true ]] || { echo 'Disable public mode before using private Tailscale Serve.' >&2; exit 1; }
DOMAIN="$(tailscale status --json | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("BackendState")=="Running", "Run tailscale up first"; print(d["Self"]["DNSName"].rstrip("."))')"
[[ "$DOMAIN" =~ ^[a-zA-Z0-9.-]+\.ts\.net$ ]] || { echo 'Unexpected Tailscale DNS name' >&2; exit 1; }
python3 - "$ROOT/.env" "$DOMAIN" <<'PY'
import pathlib,re,sys
p=pathlib.Path(sys.argv[1]); text=p.read_text(); value='PUBLIC_ORIGIN=https://'+sys.argv[2]
text=re.sub(r'^PUBLIC_ORIGIN=.*$',value,text,flags=re.M) if re.search(r'^PUBLIC_ORIGIN=',text,re.M) else text+'\n'+value+'\n'
p.write_text(text); p.chmod(0o600)
PY
compose up -d --force-recreate api
# Serve is private to the tailnet; Funnel is deliberately not enabled.
tailscale serve --bg "http://127.0.0.1:$(read_env PORT 3080)"
printf 'Private workspace: https://%s\nOperator login remains required.\n' "$DOMAIN"
