---
name: repomix-web-pack
description: Audit token distribution, scrub secrets, and pack a local or remote repository into a single XML or Markdown bundle for any frontier model in a web UI without repo access.
---

# Repomix Web Context Pack

Use this skill when preparing a repository for a frontier model locked inside a web UI (such as a browser chat, preview tab, or search AI mode) that lacks IDE, CLI, or Git repository connectors.

## Execution Rules

1. **Audit token weight before packing.** Run `npx --yes repomix --no-files --token-count-tree 500 --top-files-len 10` first to catch vendored bundles, lockfiles, or generated artifacts that would exhaust the target context window.
2. **Never disable security checks on outbound bundles.** Keep Secretlint enabled (default behavior). Never pass `--no-security-check` for files you plan to upload to a hosted web model.
3. **Scope before compressing.** Prefer `--include` and `--ignore` to isolate the target subsystem first. Add `--compress` (Tree-sitter structural extraction) when you need architectural planning or audits across a large tree under a tight token cap; skip `--compress` for line-level bug hunting.
4. **Enforce a hard token ceiling.** Pass `--token-budget 150000` (or match your target web model's ceiling) so oversized runs fail fast instead of silently truncating. If a monorepo exceeds the limit, pack subsystem slices or use `--split-output 2mb`.
5. **Attach a task contract.** Require exact file-path and line-number citations, unified diffs, and an explicit list of any missing files that need unpacking next.

## Standard Commands

```bash
# 1. Inspect token hogs before generating output
npx --yes repomix --token-count-tree 500 --top-files-len 10

# 2. Pack full source with line numbers and token ceiling
npx --yes repomix src --style xml --output-show-line-numbers --token-budget 150000 -o repomix-output.xml

# 3. Pack a scoped feature slice in Markdown for quick copy-paste
npx --yes repomix --include "src/api/**,src/lib/**" --ignore "**/*.test.*" --style markdown --copy

# 4. Pack architectural skeleton of a large repo using Tree-sitter compression
npx --yes repomix src --style xml --compress --token-budget 150000 -o repomix-skeleton.xml
```

## Verification Probe

Run a non-destructive token audit and verify the pack exits 0 without exceeding budget or leaking secrets:

```bash
npx --yes repomix src --style xml --token-budget 150000 -o /tmp/repomix-verify.xml && wc -c /tmp/repomix-verify.xml && rm -f /tmp/repomix-verify.xml
```
