#!/usr/bin/env bash
# audit_secrets.sh — Sub-5-second credential isolation and leak audit probe
set -euo pipefail

echo "=== Anthropic Credential Isolation Audit ==="

# 1. Check file permissions on .env if present
if [[ -f ".env" ]]; then
  PERMS=$(stat -c "%a" .env 2>/dev/null || stat -f "%Lp" .env 2>/dev/null || echo "unknown")
  if [[ "$PERMS" != "600" && "$PERMS" != "400" ]]; then
    echo "WARNING: .env permissions are $PERMS. Run: chmod 600 .env"
  else
    echo "PASS: .env permissions are properly restricted ($PERMS)"
  fi
else
  echo "INFO: No local .env file found (safe baseline)"
fi

# 2. Check git staging status for .env files
LEAK_CHECK=$(git status --porcelain 2>/dev/null | grep -E '\.env$' || true)
if [[ -n "$LEAK_CHECK" ]]; then
  echo "FAIL: .env is tracked or staged in git! Unstage immediately: git rm --cached .env"
  exit 1
else
  echo "PASS: No .env files staged in git"
fi

# 3. Check environment variable format without echoing secret
if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
  KEY_LEN=${#ANTHROPIC_API_KEY}
  PREFIX="${ANTHROPIC_API_KEY:0:7}"
  SUFFIX="${ANTHROPIC_API_KEY: -4}"
  echo "PASS: ANTHROPIC_API_KEY is present in environment (Length: $KEY_LEN, Format: ${PREFIX}...${SUFFIX})"
else
  echo "INFO: ANTHROPIC_API_KEY is not currently set in active shell"
fi

echo "=== Audit Completed Successfully ==="
