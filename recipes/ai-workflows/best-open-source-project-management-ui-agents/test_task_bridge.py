#!/usr/bin/env python3
"""
Verification test suite for AgentTaskBridge.
Runs offline tests verifying adapter logic, status transitions, and error states.
"""

import unittest
from starter import MockAdapter, get_adapter, PlaneAdapter, OpenProjectAdapter, VikunjaAdapter


class TestAgentTaskBridge(unittest.TestCase):

    def setUp(self):
        self.mock = MockAdapter()

    def test_mock_list_tasks(self):
        tasks = self.mock.list_tasks()
        self.assertGreaterEqual(len(tasks), 2)
        in_progress = self.mock.list_tasks(status="in_progress")
        self.assertEqual(len(in_progress), 1)
        self.assertEqual(in_progress[0]["id"], "TSK-101")

    def test_mock_create_task(self):
        new_task = self.mock.create_task(
            title="Implement OAuth callback check",
            description="Autonomous token validator",
            status="backlog"
        )
        self.assertTrue(new_task["id"].startswith("TSK-"))
        self.assertEqual(new_task["title"], "Implement OAuth callback check")
        self.assertEqual(new_task["status"], "backlog")

        # Verify task is listed
        all_tasks = self.mock.list_tasks()
        self.assertIn(new_task["id"], [t["id"] for t in all_tasks])

    def test_mock_update_task_status(self):
        updated = self.mock.update_task_status("TSK-102", "done")
        self.assertEqual(updated["status"], "done")

        # Non-existent task error
        with self.assertRaises(KeyError):
            self.mock.update_task_status("TSK-9999", "done")

    def test_adapter_factory(self):
        adapter_mock = get_adapter("mock")
        self.assertIsInstance(adapter_mock, MockAdapter)

        adapter_plane = get_adapter("plane")
        self.assertIsInstance(adapter_plane, PlaneAdapter)

        adapter_op = get_adapter("openproject")
        self.assertIsInstance(adapter_op, OpenProjectAdapter)

        adapter_vik = get_adapter("vikunja")
        self.assertIsInstance(adapter_vik, VikunjaAdapter)


if __name__ == "__main__":
    unittest.main()
