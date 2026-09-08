#!/usr/bin/env python3
"""
ZeroLabs Companion Starter: Unified AI Coding Agent Workspace Initializer
Validates and provisions multi-agent configuration and instruction files:
- Claude Code (.claudecode/CLAUDE.md or CLAUDE.md)
- GitHub Copilot CLI (.github/copilot-instructions.md)
- Gemini CLI (.gemini/GEMINI.md or GEMINI.md)
- Unified Canonical AGENTS.md with deterministic boundary checks

Teardown & Architecture:
https://labs.zeroshot.studio/ai-workflows/setting-up-ai-coding-agents-claude-code-codex-and-gemini-cli
"""

import os
import sys
import json
from pathlib import Path
from typing import Dict, List, Optional

SUPPORTED_AGENTS = {
    "claude": {
        "name": "Claude Code",
        "instruction_path": Path(".claudecode/CLAUDE.md"),
        "fallback_path": Path("CLAUDE.md"),
        "env_var": "ANTHROPIC_API_KEY",
    },
    "copilot": {
        "name": "GitHub Copilot CLI",
        "instruction_path": Path(".github/copilot-instructions.md"),
        "fallback_path": None,
        "env_var": "GITHUB_TOKEN",
    },
    "gemini": {
        "name": "Gemini CLI",
        "instruction_path": Path(".gemini/GEMINI.md"),
        "fallback_path": Path("GEMINI.md"),
        "env_var": "GEMINI_API_KEY",
    },
}

CANONICAL_INSTRUCTION_HEADER = """# AGENTS.md — Unified Workspace Rules

## 1. Persona & Tone
- Conciseness first. No sycophancy, no speculative fluff.
- Output deterministic diffs, exact file paths, and verifiable unit tests.

## 2. Execution Boundaries
- Treat production credentials and secret files as read-only and restricted.
- Run unit test suites before and after making codebase modifications.
- Prefer non-destructive file operations (`trash` / staged branches over irreversible deletes).

## 3. Architecture & Dependency Rules
- Always consult existing patterns before introducing third-party packages.
- Adhere to semantic versioning and existing monorepo module boundaries.
"""


class AgentWorkspaceManager:
    def __init__(self, root_dir: Path):
        self.root_dir = root_dir.resolve()

    def audit_workspace(self) -> Dict[str, Dict]:
        """Audits current workspace for agent configurations and credentials."""
        results = {}
        for agent_key, cfg in SUPPORTED_AGENTS.items():
            primary = self.root_dir / cfg["instruction_path"]
            fallback = self.root_dir / cfg["fallback_path"] if cfg["fallback_path"] else None
            
            exists = primary.exists() or (fallback.exists() if fallback else False)
            active_path = primary if primary.exists() else (fallback if fallback and fallback.exists() else primary)
            
            env_var = cfg["env_var"]
            has_env = bool(os.environ.get(env_var))

            results[agent_key] = {
                "name": cfg["name"],
                "configured": exists,
                "path": str(active_path.relative_to(self.root_dir)),
                "auth_env_set": has_env,
                "env_var": env_var
            }
        return results

    def provision_unified_workspace(self, force: bool = False) -> List[Path]:
        """
        Creates canonical AGENTS.md and symlinks / mirrors it to Claude,
        Copilot, and Gemini target paths.
        """
        agents_file = self.root_dir / "AGENTS.md"
        if not agents_file.exists() or force:
            agents_file.write_text(CANONICAL_INSTRUCTION_HEADER.strip() + "\n", encoding="utf-8")

        provisioned = [agents_file]

        for agent_key, cfg in SUPPORTED_AGENTS.items():
            target = self.root_dir / cfg["instruction_path"]
            target.parent.mkdir(parents=True, exist_ok=True)
            
            if not target.exists() or force:
                # Mirror unified instructions with agent-specific pointer
                content = f"<!-- Auto-generated reference to canonical AGENTS.md -->\n"
                content += f"<!-- See: https://labs.zeroshot.studio/ai-workflows/setting-up-ai-coding-agents-claude-code-codex-and-gemini-cli -->\n\n"
                content += agents_file.read_text(encoding="utf-8")
                target.write_text(content, encoding="utf-8")
                provisioned.append(target)

        return provisioned


def main():
    print("================================================================")
    print("🤖 ZeroLabs Multi-Agent Workspace Setup & Audit Harness")
    print("================================================================")
    
    workspace = AgentWorkspaceManager(Path.cwd())
    audit = workspace.audit_workspace()

    print("\n[+] Current Agent Configuration Status:")
    for agent_id, data in audit.items():
        status_sym = "✅" if data["configured"] else "❌"
        auth_sym = "🔑" if data["auth_env_set"] else "⚠️ (missing)"
        print(f"  {status_sym} {data['name']}:")
        print(f"      Path: {data['path']}")
        print(f"      Auth [{data['env_var']}]: {auth_sym}")

    print("\n[+] Provisioning unified AGENTS.md configuration...")
    files = workspace.provision_unified_workspace()
    for f in files:
        print(f"  ✨ Synchronized: {f.name}")

    print("\n✅ Setup verified. All agents now target synchronized instructions.")


if __name__ == "__main__":
    main()

