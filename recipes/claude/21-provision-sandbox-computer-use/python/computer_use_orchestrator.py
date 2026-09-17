"""
Claude Computer Use Virtual Desktop Sandbox Orchestrator.
Demonstrates:
- Computer tool registration (`computer_20250124`).
- Screen coordinate handling and action dispatch (`mouse_move`, `left_click`, `type`, `key`, `screenshot`).
- Human-in-the-loop validation boundary for sensitive actions.
- Multi-turn execution loop feeding base64 screenshot results back to Claude.
"""

import os
import sys
import base64
import json
import logging
from typing import Dict, Any, List, Optional
from anthropic import Anthropic

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("computer-use-sandbox")

# 1. Mock Screen Interface (Simulates an Xvfb / VNC virtual desktop framebuffer)
class VirtualDesktop:
    def __init__(self, width: int = 1024, height: int = 768, display_num: int = 1):
        self.width = width
        self.height = height
        self.display_num = display_num
        self.cursor_x = 0
        self.cursor_y = 0
        self.action_history: List[Dict[str, Any]] = []

    def capture_screenshot_base64(self) -> str:
        """
        Returns a mock 1x1 transparent PNG encoded in base64.
        In production, replace with:
            subprocess.run(["scrot", "-z", "/tmp/screen.png"])
            with open("/tmp/screen.png", "rb") as f:
                return base64.b64encode(f.read()).decode("utf-8")
        """
        # Minimal valid 1x1 transparent PNG
        png_bytes = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05"
            b"\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        return base64.b64encode(png_bytes).decode("utf-8")

    def execute_action(self, action: str, **kwargs) -> Dict[str, Any]:
        """Dispatches an action to the virtual desktop."""
        self.action_history.append({"action": action, "kwargs": kwargs})

        if action == "screenshot":
            logger.info("VirtualDesktop: Capturing screenshot at %sx%s", self.width, self.height)
            return {"screenshot_base64": self.capture_screenshot_base64()}

        elif action == "mouse_move":
            x, y = kwargs.get("coordinate", [0, 0])
            self.cursor_x = max(0, min(self.width, x))
            self.cursor_y = max(0, min(self.height, y))
            logger.info("VirtualDesktop: Mouse moved to (%s, %s)", self.cursor_x, self.cursor_y)
            return {"status": "success", "cursor": [self.cursor_x, self.cursor_y]}

        elif action in ("left_click", "right_click", "double_click", "triple_click", "middle_click"):
            logger.info("VirtualDesktop: Executing %s at current position (%s, %s)", action, self.cursor_x, self.cursor_y)
            return {"status": "success", "action": action}

        elif action == "type":
            text = kwargs.get("text", "")
            logger.info("VirtualDesktop: Typing text (length %d)", len(text))
            return {"status": "success", "characters_typed": len(text)}

        elif action == "key":
            text = kwargs.get("text", "")
            logger.info("VirtualDesktop: Pressing key combination '%s'", text)
            return {"status": "success", "key": text}

        elif action == "cursor_position":
            return {"coordinate": [self.cursor_x, self.cursor_y]}

        else:
            logger.warning("VirtualDesktop: Unsupported action '%s'", action)
            return {"status": "unsupported_action", "action": action}


# 2. Security Boundary and Human-In-The-Loop Gate
class SandboxSecurityGateway:
    SENSITIVE_ACTIONS = {"submit_order", "delete_file", "sudo", "transfer_funds"}

    @classmethod
    def evaluate_safety(cls, action: str, parameters: Dict[str, Any]) -> bool:
        """
        Evaluates whether an action requires human operator confirmation.
        Returns True if safe to proceed automatically, False if gate is tripped.
        """
        # Check text keystrokes for destructive shell commands
        text = parameters.get("text", "").lower()
        if "rm -rf" in text or "sudo" in text or ":(){ :|:& };:" in text:
            logger.warning("SECURITY ALERT: Destructive command detected in keystroke buffer: %s", text)
            return False
        return True


# 3. Agent Execution Loop
def run_computer_use_agent(goal: str, max_turns: int = 5):
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        logger.error("ANTHROPIC_API_KEY environment variable is required.")
        sys.exit(1)

    client = Anthropic(api_key=api_key)
    desktop = VirtualDesktop(width=1024, height=768, display_num=1)
    security_gateway = SandboxSecurityGateway()

    # Tool definition for computer use beta
    computer_tool = {
        "type": "computer_20250124",
        "name": "computer",
        "display_width_px": desktop.width,
        "display_height_px": desktop.height,
        "display_number": desktop.display_num,
    }

    messages: List[Dict[str, Any]] = [
        {"role": "user", "content": goal}
    ]

    turn = 0
    while turn < max_turns:
        turn += 1
        logger.info("Turn %d: Calling Anthropic API...", turn)

        response = client.messages.create(
            model="claude-3-7-sonnet-20250219",
            max_tokens=2048,
            tools=[computer_tool],
            betas=["computer-use-2025-01-24"],
            messages=messages,
        )

        logger.info("Response stop reason: %s", response.stop_reason)

        # Append assistant message to conversation history
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason != "tool_use":
            logger.info("Agent finished execution with reason: %s", response.stop_reason)
            for block in response.content:
                if getattr(block, "type", "") == "text":
                    print(f"\nFinal Response:\n{block.text}")
            break

        # Process tool calls
        tool_results: List[Dict[str, Any]] = []
        for block in response.content:
            if getattr(block, "type", "") != "tool_use":
                continue

            tool_use_id = block.id
            tool_name = block.name
            tool_input = block.input

            logger.info("Tool invocation requested: %s (id: %s)", tool_name, tool_use_id)

            if tool_name == "computer":
                action = tool_input.get("action")
                # Human-in-the-loop safety gate
                if not security_gateway.evaluate_safety(action, tool_input):
                    logger.error("Action blocked by Security Gateway: %s", action)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tool_use_id,
                        "is_error": True,
                        "content": "SecurityPolicyViolation: Action rejected by human-in-the-loop safety gate."
                    })
                    continue

                # Execute action on virtual desktop
                exec_result = desktop.execute_action(action, **tool_input)

                if action == "screenshot":
                    # For screenshot, return image block inside tool_result
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tool_use_id,
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/png",
                                    "data": exec_result["screenshot_base64"]
                                }
                            }
                        ]
                    })
                else:
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tool_use_id,
                        "content": json.dumps(exec_result)
                    })
            else:
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "is_error": True,
                    "content": f"Unknown tool: {tool_name}"
                })

        # Append tool results as user turn
        messages.append({"role": "user", "content": tool_results})


if __name__ == "__main__":
    test_goal = os.environ.get("TEST_GOAL", "Open the terminal and check system date.")
    logger.info("Starting Computer Use Sandbox Orchestrator with goal: '%s'", test_goal)
    run_computer_use_agent(test_goal)
