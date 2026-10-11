"""Offline protocol tests; no provider SDK, API requests, or desktop required."""
import base64
import copy
import json
import os
import struct
import sys
import unittest
import zlib
from types import SimpleNamespace
from unittest.mock import patch

from computer_use_orchestrator import ComputerUseSimulator, ExampleActionFilter, run_computer_use_agent


class SimulatorTests(unittest.TestCase):
    def test_placeholder_is_valid_transparent_one_pixel_png(self):
        screenshot = ComputerUseSimulator().execute_action("screenshot")
        self.assertTrue(screenshot["simulated"])
        png = base64.b64decode(screenshot["screenshot_base64"], validate=True)
        self.assertEqual(png[:8], b"\x89PNG\r\n\x1a\n")
        position = 8
        chunks = {}
        while position < len(png):
            length = struct.unpack(">I", png[position:position + 4])[0]
            kind = png[position + 4:position + 8]
            payload = png[position + 8:position + 8 + length]
            crc = struct.unpack(">I", png[position + 8 + length:position + 12 + length])[0]
            self.assertEqual(crc, zlib.crc32(kind + payload), kind)
            chunks[kind] = payload
            position += 12 + length
        self.assertEqual(position, len(png))
        self.assertEqual(struct.unpack(">IIBBBBB", chunks[b"IHDR"]), (1, 1, 8, 6, 0, 0, 0))
        self.assertEqual(zlib.decompress(chunks[b"IDAT"]), b"\x00" * 5)
        self.assertEqual(chunks[b"IEND"], b"")

    def test_actions_are_explicitly_simulated(self):
        desktop = ComputerUseSimulator()
        moved = desktop.execute_action("mouse_move", coordinate=[1024, -1])
        self.assertEqual(moved["cursor"], [1023, 0])
        for action in ("left_click", "right_click", "double_click", "triple_click", "middle_click", "type", "key", "cursor_position", "unsupported"):
            with self.subTest(action=action):
                self.assertTrue(desktop.execute_action(action, text="demonstration only")["simulated"])
        self.assertFalse(ExampleActionFilter.accepts("type", {"text": "sudo rm -rf /"}))
        self.assertEqual(desktop.execute_action("unsupported")["status"], "unsupported_action")

    def test_live_loop_protocol_with_in_memory_provider(self):
        calls = []
        replies = iter([
            SimpleNamespace(stop_reason="tool_use", content=[
                SimpleNamespace(type="tool_use", id="screenshot-1", name="computer", input={"action": "screenshot"}),
                SimpleNamespace(type="tool_use", id="move-1", name="computer", input={"action": "mouse_move", "coordinate": [50, 60]}),
                SimpleNamespace(type="tool_use", id="rejected-1", name="computer", input={"action": "type", "text": "sudo rm -rf /"}),
            ]),
            SimpleNamespace(stop_reason="end_turn", content=[]),
        ])

        def create(**parameters):
            calls.append(copy.deepcopy(parameters))
            return next(replies)

        provider = SimpleNamespace(Anthropic=lambda **_: SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(create=create))))
        with patch.dict(sys.modules, {"anthropic": provider}), patch.dict(os.environ, {"ANTHROPIC_API_KEY": "example-placeholder"}):
            run_computer_use_agent("Demonstrate simulated actions")
        self.assertEqual(len(calls), 2)
        self.assertIn("protocol simulator", calls[0]["messages"][0]["content"])
        results = calls[1]["messages"][-1]["content"]
        self.assertIn("1x1 placeholder", results[0]["content"][0]["text"])
        self.assertEqual(results[0]["content"][1]["type"], "image")
        self.assertEqual(json.loads(results[1]["content"]), {"simulated": True, "status": "simulated", "cursor": [50, 60]})
        self.assertTrue(results[2]["is_error"])
        self.assertIn("No human approval", results[2]["content"])


if __name__ == "__main__":
    unittest.main()
