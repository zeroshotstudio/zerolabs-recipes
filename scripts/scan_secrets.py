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
import subprocess
from pathlib import Path
from urllib.parse import urlsplit

SENSITIVE_PATTERNS = [
    # 1. API Keys & Tokens
    # Modern provider keys include a prefix and URL-safe punctuation in the body.
    (r"(?<![a-zA-Z0-9_-])sk-(?:(?:proj|svcacct)-|ant-api\d{2}-)?[a-zA-Z0-9_-]{20,}(?![a-zA-Z0-9_-])", "OpenAI / Anthropic Secret Key (`sk-...`)"),
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
    # Exempt only entire placeholder values, never neighboring line content.
    r"(?:sk-(?:(?:proj|svcacct)-|ant-(?:api\d{2}-)?)?)?your[-_](?:anthropic[-_])?(?:api[-_])?key(?:[-_]here)?",
    r"your[-_]secret[-_]here",
    r"dummy[-_]key[-_]for[-_]testing",
    r"mock[-_]key",
    r"PLACEHOLDER",
    r"sk-ant-api03-(?:placeholder-do-not-commit|sample-placeholder-do-not-commit-live-keys-here|placeholder-key-here)",
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

TEXT_SUFFIXES = {
    ".py", ".ts", ".js", ".mjs", ".cjs", ".sh", ".json", ".yaml", ".yml",
    ".txt", ".md", ".html", ".css", ".svg", ".toml", ".ini", ".csv", ".sql",
    ".env", ".example", ".service", ".timer", ".conf", ".xml",
}


class ScanError(RuntimeError):
    """A scan could not complete; publishing must fail closed."""


def redact(text: str) -> str:
    """Paths and error messages can contain credentials too."""
    for regex, _description in SENSITIVE_PATTERNS:
        text = re.sub(regex, "[REDACTED]", text)
    return text


def decode_content(data: bytes, source_name: str) -> str:
    # Git treats UTF-16/32 files as binary, so scan decoded blob content directly.
    for signature, encoding in ((b"\xff\xfe\x00\x00", "utf-32"), (b"\x00\x00\xfe\xff", "utf-32"),
                                (b"\xff\xfe", "utf-16"), (b"\xfe\xff", "utf-16"), (b"\xef\xbb\xbf", "utf-8-sig")):
        if data.startswith(signature):
            try:
                return data.decode(encoding)
            except UnicodeError as error:
                raise ScanError(f"Cannot decode '{redact(source_name)}' as {encoding}.") from error
    path = Path(source_name)
    if b"\x00" in data and (path.suffix.lower() in TEXT_SUFFIXES or path.name in {".env", "Dockerfile", "Makefile"}):
        raise ScanError(f"Unsupported text encoding in '{redact(source_name)}'; add a Unicode byte-order mark.")
    # ASCII credential formats remain recognizable in NUL-padded binary data
    # (including BOM-less UTF-16/32 blobs with an arbitrary filename).
    data = data.replace(b"\x00", b"")
    try:
        return data.decode("utf-8")
    except UnicodeError:
        # Preserve every byte in other files, including ASCII keys in binary assets.
        return data.decode("latin-1")


def is_whitelisted(value: str) -> bool:
    # A sample hostname is not evidence that an embedded password is a sample.
    if value.startswith(("postgres://", "postgresql://", "redis://")):
        try:
            value = urlsplit(value).password or ""
        except ValueError:
            return False
    for pattern in WHITELISTED_PATTERNS:
        if re.fullmatch(pattern, value, re.IGNORECASE):
            return True
    return False


def scan_text(text: str, source_name: str = "") -> list[dict]:
    findings = []
    lines = text.splitlines()
    for line_idx, line in enumerate(lines, 1):
        for regex, desc in SENSITIVE_PATTERNS:
            for match in re.finditer(regex, line):
                if is_whitelisted(match.group(0)):
                    continue
                findings.append({
                    "source": redact(source_name),
                    "line": line_idx,
                    "matched_text": "[REDACTED]",
                    "description": desc,
                    # Do not send credentials or neighboring secrets to CI logs.
                    "snippet": "[REDACTED]"
                })
    return findings


def scan_file(file_path: Path) -> list[dict]:
    try:
        content = decode_content(file_path.read_bytes(), str(file_path))
        return scan_text(content, str(file_path))
    except OSError as e:
        raise ScanError(f"Cannot read '{redact(str(file_path))}' ({type(e).__name__}).") from e


def scan_directory(dir_path: Path) -> list[dict]:
    all_findings = []
    def unreadable(error):
        raise ScanError(f"Cannot traverse '{redact(str(error.filename))}' ({type(error).__name__}).") from error

    for root, dirs, files in os.walk(dir_path, onerror=unreadable):
        dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS]
        for f in files:
            p = Path(root) / f
            all_findings.extend(scan_file(p))
    return all_findings


def scan_git_diff(cached: bool = True) -> list[dict]:
    cmd = ["git", "diff", "--no-ext-diff", "--no-textconv", "--name-only", "-z", "--diff-filter=ACMRT"]
    if cached:
        cmd.append("--cached")
    try:
        res = subprocess.run(cmd, capture_output=True, check=True)
    except (OSError, subprocess.CalledProcessError) as e:
        raise ScanError("Cannot read git diff; secret scan did not complete.") from e

    findings = []
    # Scan whole changed files instead of only textual patch additions: a binary
    # diff can contain credentials, and the staged blob can differ from disk.
    for encoded_path in res.stdout.split(b"\x00"):
        if not encoded_path:
            continue
        current_file = os.fsdecode(encoded_path)
        if cached:
            try:
                blob = subprocess.run(["git", "cat-file", "blob", ":0:" + current_file], capture_output=True, check=True)
            except (OSError, subprocess.CalledProcessError) as error:
                raise ScanError(f"Cannot read staged blob '{redact(current_file)}'; scan did not complete.") from error
            findings.extend(scan_text(decode_content(blob.stdout, current_file), current_file))
        else:
            findings.extend(scan_file(Path(current_file)))
    return findings


def main():
    parser = argparse.ArgumentParser(description="ZeroLabs Secret Scanner")
    parser.add_argument("path", nargs="?", default=None, help="Path to file or directory to scan")
    parser.add_argument("--git-staged", action="store_true", help="Scan git staged changes (pre-commit)")
    parser.add_argument("--git-diff", action="store_true", help="Scan unstaged git changes")
    args = parser.parse_args()

    findings = []

    try:
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
                raise ScanError(f"Path '{args.path}' not found.")
        else:
            findings = scan_directory(Path("."))
    except ScanError as error:
        print(f"Error: {redact(str(error))}", file=sys.stderr)
        sys.exit(2)

    if findings:
        print(f"\n🚨 SENSITIVE DATA LEAK DETECTED ({len(findings)} issue(s)):")
        print("=" * 60)
        for f in findings:
            print(f"File: {redact(f['source'])}:{f['line']}")
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
