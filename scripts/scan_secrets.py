#!/usr/bin/env python3
"""
ZeroLabs Recipe & Repository Secret Scanner
===========================================
Scans staged files, PR diffs, and repository directories to prevent accidental
leakage of API keys, private credentials, internal hostnames, and private tokens.
"""

import os
import sys
import re
import argparse
from pathlib import Path

SENSITIVE_PATTERNS = [
    # 1. API Keys & Tokens
    (r"\bsk-[a-zA-Z0-9]{20,}\b", "OpenAI / Anthropic Secret Key (`sk-...`)"),
    (r"\bghp_[a-zA-Z0-9]{36,}\b", "GitHub Personal Access Token (`ghp_...`)"),
    (r"\bgho_[a-zA-Z0-9]{36,}\b", "GitHub OAuth Access Token (`gho_...`)"),
    (r"\bgithub_pat_[a-zA-Z0-9_]{50,}\b", "GitHub Fine-Grained Personal Access Token"),
    (r"\beyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\b", "JSON Web Token (JWT)"),
    (r"-----BEGIN\s+(?:RSA|OPENSSH|DSA|EC)?\s*PRIVATE\s+KEY-----", "Cryptographic private key block"),

    # 2. Database & Connection Strings with credentials
    (r"postgres(?:ql)?://[^\s:'\"]+:[^\s@'\"]+@[^\s'\"]+", "Database connection string with embedded password"),
    (r"redis://:[^\s@'\"]+@[^\s'\"]+", "Redis connection string with embedded password"),

    # 3. Private Network & Internal Infrastructure Identifiers
    (r"\btail[a-f0-9]{6}\.ts\.net\b", "Private Tailscale network domain"),
    (r"\b100\.(?:6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.[0-9]{1,3}\.[0-9]{1,3}\b", "Tailscale CGNAT IP address"),
    (r"\bzero" + r"mini(?:\.tail[a-f0-9]+\.ts\.net)?\b", "Internal MinIO storage host"),

    # 4. Personal communication IDs
    (r"\btelegram:\d{8,}\b", "Internal Telegram session/chat identifier"),
    (r"(?<![a-zA-Z0-9_])8025" + r"482062(?![a-zA-Z0-9_])", "Internal Telegram user ID"),

    # 5. Local internal filesystem paths
    (r"/home/zero" + r"shot/\.openclaw/workspace", "Absolute internal workspace path"),
    (r"/home/zero" + r"shot/\.gemini/", "Internal agent runtime path"),
]

WHITELISTED_PATTERNS = [
    r"your_anthropic_api_key_here",
    r"your_api_key_here",
    r"your-api-key-here",
    r"your_secret_here",
    r"dummy_key_for_testing",
    r"mock-key",
    r"example\.com",
    r"PLACEHOLDER",
    r"0000000000",
    r"\${[A-Z0-9_]+:-[a-zA-Z0-9_]+}",
]

EXCLUDED_DIRS = {
    ".git",
    "node_modules",
    ".next",
    "__pycache__",
    ".venv",
    "venv",
    "dist",
    "build",
    ".cache",
}

EXCLUDED_FILES = {
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "scan_secrets.py",
}


def is_whitelisted(snippet: str) -> bool:
    for pattern in WHITELISTED_PATTERNS:
        if re.search(pattern, snippet, re.IGNORECASE):
            return True
    return False


def scan_text(text: str, source_name: str = "") -> list[dict]:
    findings = []
    lines = text.splitlines()
    for line_idx, line in enumerate(lines, 1):
        if is_whitelisted(line):
            continue
        for regex, desc in SENSITIVE_PATTERNS:
            match = re.search(regex, line)
            if match:
                findings.append({
                    "source": source_name,
                    "line": line_idx,
                    "matched_text": match.group(0),
                    "description": desc,
                    "snippet": line.strip()[:100]
                })
    return findings


def scan_file(file_path: Path) -> list[dict]:
    if file_path.name in EXCLUDED_FILES:
        return []
    try:
        content = file_path.read_text(encoding="utf-8", errors="ignore")
        return scan_text(content, str(file_path))
    except Exception as e:
        return [{"source": str(file_path), "line": 0, "matched_text": "", "description": f"Read error: {e}", "snippet": ""}]


def scan_directory(dir_path: Path) -> list[dict]:
    all_findings = []
    for root, dirs, files in os.walk(dir_path):
        dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS]
        for f in files:
            if f in EXCLUDED_FILES:
                continue
            p = Path(root) / f
            all_findings.extend(scan_file(p))
    return all_findings


def scan_git_diff(cached: bool = True) -> list[dict]:
    import subprocess
    cmd = ["git", "diff", "--unified=0"]
    if cached:
        cmd.append("--cached")
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error running git diff: {e}")
        return []

    findings = []
    current_file = ""
    line_num = 0

    for line in res.stdout.splitlines():
        if line.startswith("+++ b/"):
            current_file = line[6:]
        elif line.startswith("@@"):
            m = re.search(r"\+(\d+)", line)
            if m:
                line_num = int(m.group(1))
        elif line.startswith("+") and not line.startswith("+++"):
            if current_file.endswith("scan_secrets.py"):
                continue
            added_text = line[1:]
            if not is_whitelisted(added_text):
                for regex, desc in SENSITIVE_PATTERNS:
                    match = re.search(regex, added_text)
                    if match:
                        findings.append({
                            "source": current_file,
                            "line": line_num,
                            "matched_text": match.group(0),
                            "description": desc,
                            "snippet": added_text.strip()[:100]
                        })
            line_num += 1
    return findings


def main():
    parser = argparse.ArgumentParser(description="ZeroLabs Secret Scanner")
    parser.add_argument("path", nargs="?", default=None, help="Path to file or directory to scan")
    parser.add_argument("--git-staged", action="store_true", help="Scan git staged changes (pre-commit)")
    parser.add_argument("--git-diff", action="store_true", help="Scan unstaged git changes")
    args = parser.parse_args()

    findings = []

    if args.git_staged:
        findings = scan_git_diff(cached=True)
    elif args.git_diff:
        findings = scan_git_diff(cached=False)
    elif args.path:
        target = Path(args.path)
        if target.is_file():
            findings = scan_file(target)
        elif target.is_dir():
            findings = scan_directory(target)
        else:
            print(f"Error: path '{args.path}' not found.")
            sys.exit(1)
    else:
        findings = scan_directory(Path("."))

    if findings:
        print(f"\n🚨 SENSITIVE DATA LEAK DETECTED ({len(findings)} issue(s)):")
        print("=" * 60)
        for f in findings:
            print(f"File: {f['source']}:{f['line']}")
            print(f"Rule: {f['description']}")
            print(f"Text: {f['snippet']}")
            print("-" * 60)
        print("\n❌ Commit/Publish blocked. Remove sensitive credentials or internal paths before continuing.\n")
        sys.exit(1)
    else:
        print("✅ Secret scanner: No sensitive patterns or leaked keys detected.")
        sys.exit(0)


if __name__ == "__main__":
    main()
