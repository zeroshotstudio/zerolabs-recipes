import os
import json
import unittest
import tempfile
from app import McpToolRegistry, TokenTracker, AutonomousMcpAgent, StateStore

class TestMcpAgentStarter(unittest.TestCase):
    def test_registry_registration(self):
        registry = McpToolRegistry()
        tools = registry.get_tool_definitions()
        tool_names = [t["name"] for t in tools]
        self.assertIn("read_file", tool_names)
        self.assertIn("calculate_token_cost", tool_names)

    def test_tool_execution(self):
        registry = McpToolRegistry()
        res = registry.execute_tool("calculate_token_cost", {
            "input_tokens": 1000,
            "output_tokens": 200
        })
        data = json.loads(res)
        self.assertIn("estimated_cost_usd", data)
        self.assertEqual(data["input_tokens"], 1000)

    def test_directory_traversal_guard(self):
        registry = McpToolRegistry()
        res = registry.execute_tool("read_file", {"path": "../../etc/passwd"})
        data = json.loads(res)
        self.assertIn("error", data)
        self.assertIn("denied", data["error"].lower())

    def test_token_tracker(self):
        tracker = TokenTracker()
        tracker.record(100, 50)
        tracker.record(200, 150)
        self.assertEqual(tracker.turn_count, 2)
        self.assertEqual(tracker.input_tokens, 300)
        self.assertEqual(tracker.output_tokens, 200)
        self.assertEqual(tracker.total_tokens, 500)

    def test_mock_agent_run(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            orig_cwd = os.getcwd()
            try:
                os.chdir(tmp_dir)
                agent = AutonomousMcpAgent(api_key="mock-key")
                res = agent.run("Test run prompt")
                self.assertEqual(res["status"], "completed_mock")
                self.assertEqual(res["turns"], 1)
                self.assertEqual(res["tokens"], 1900)
            finally:
                os.chdir(orig_cwd)

if __name__ == "__main__":
    unittest.main()
