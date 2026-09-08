#!/usr/bin/env python3
"""
Test suite for Setting Up AI Coding Agents companion recipe.
"""
import unittest
import tempfile
import shutil
from pathlib import Path
from starter import AgentWorkspaceManager, SUPPORTED_AGENTS

class TestAgentWorkspaceManager(unittest.TestCase):
    def setUp(self):
        self.test_dir = Path(tempfile.mkdtemp())
        self.manager = AgentWorkspaceManager(self.test_dir)

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_audit_empty_workspace(self):
        audit = self.manager.audit_workspace()
        self.assertEqual(len(audit), 3)
        for key in ["claude", "copilot", "gemini"]:
            self.assertIn(key, audit)
            self.assertFalse(audit[key]["configured"])

    def test_provision_workspace(self):
        files = self.manager.provision_unified_workspace()
        self.assertTrue(len(files) >= 4)
        
        # Verify AGENTS.md was created
        agents_file = self.test_dir / "AGENTS.md"
        self.assertTrue(agents_file.exists())
        self.assertIn("Unified Workspace Rules", agents_file.read_text(encoding="utf-8"))

        # Verify agent instruction files were mirrored
        audit = self.manager.audit_workspace()
        for key in ["claude", "copilot", "gemini"]:
            self.assertTrue(audit[key]["configured"])
            target_path = self.test_dir / SUPPORTED_AGENTS[key]["instruction_path"]
            self.assertTrue(target_path.exists())

if __name__ == "__main__":
    unittest.main()

