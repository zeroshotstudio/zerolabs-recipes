"""Computer Use protocol simulator; this module controls no actual desktop.

Actions only update Python state and screenshots are a transparent 1x1 PNG.
The toy keyword filter supplies no isolation or human-approval guarantee.
Live mode makes real Anthropic API requests and may incur usage charges.
"""

import os
import sys
import json
import logging
from typing import Dict, Any, List

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("computer-use-simulator")
SIMULATOR_WARNING = (
    "PROTOCOL SIMULATOR ONLY: no desktop, container isolation, network filtering "
    "or human approval is implemented. Screenshots are a transparent 1x1 PNG. "
    "Live mode makes real Anthropic requests and may incur charges."
)
PLACEHOLDER_SCREENSHOT_BASE64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII="
)

# 1. In-memory action simulator; no X11, VNC, shell or filesystem driver.
class ComputerUseSimulator:
    def __init__(self, width: int = 1024, height: int = 768, display_num: int = 1):
        self.width = width
        self.height = height
        self.display_num = display_num
        self.cursor_x = 0
        self.cursor_y = 0
        self.action_history: List[Dict[str, Any]] = []

    def capture_screenshot_base64(self) -> str:
        """Return a placeholder image, independent of nominal display size."""
        return PLACEHOLDER_SCREENSHOT_BASE64

    def execute_action(self, action: str, **kwargs) -> Dict[str, Any]:
        """Record an action without sending any operating-system input."""
        self.action_history.append({"action": action, "kwargs": kwargs})

        if action == "screenshot":
            logger.info("Simulator: Returning transparent 1x1 placeholder screenshot")
            return {"simulated": True, "screenshot_base64": self.capture_screenshot_base64(), "image_width": 1, "image_height": 1}

        elif action == "mouse_move":
            x, y = kwargs.get("coordinate", [0, 0])
            self.cursor_x = max(0, min(self.width - 1, x))
            self.cursor_y = max(0, min(self.height - 1, y))
            logger.info("Simulator: Recorded cursor (%s, %s)", self.cursor_x, self.cursor_y)
            return {"simulated": True, "status": "simulated", "cursor": [self.cursor_x, self.cursor_y]}

        elif action in ("left_click", "right_click", "double_click", "triple_click", "middle_click"):
            logger.info("Simulator: Recorded %s at (%s, %s)", action, self.cursor_x, self.cursor_y)
            return {"simulated": True, "status": "simulated", "action": action}

        elif action == "type":
            text = kwargs.get("text", "")
            logger.info("Simulator: Recorded text (length %d); nothing was typed", len(text))
            return {"simulated": True, "status": "simulated", "characters_simulated": len(text)}

        elif action == "key":
            text = kwargs.get("text", "")
            logger.info("Simulator: Recorded a key combination; nothing was pressed")
            return {"simulated": True, "status": "simulated", "key": text}

        elif action == "cursor_position":
            return {"simulated": True, "coordinate": [self.cursor_x, self.cursor_y]}

        else:
            logger.warning("Simulator: Unsupported action '%s'", action)
            return {"simulated": True, "status": "unsupported_action", "action": action}


# 2. Toy keyword rejection illustrates tool errors; it is not a security boundary.
class ExampleActionFilter:

    @classmethod
    def accepts(cls, action: str, parameters: Dict[str, Any]) -> bool:
        """Return an illustrative keyword decision; no human approval occurs."""
        text = parameters.get("text", "").lower()
        if "rm -rf" in text or "sudo" in text or ":(){ :|:& };:" in text:
            logger.warning("Toy filter rejected simulated text; this is not a security guarantee")
            return False
        return True


# 3. Agent Execution Loop
def run_computer_use_agent(goal: str, max_turns: int = 5):
    logger.warning(SIMULATOR_WARNING)
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        logger.error("ANTHROPIC_API_KEY environment variable is required.")
        sys.exit(1)

    from anthropic import Anthropic
    client = Anthropic(api_key=api_key)
    desktop = ComputerUseSimulator(width=1024, height=768, display_num=1)
    action_filter = ExampleActionFilter()

    # Tool definition for computer use beta
    computer_tool = {
        "type": "computer_20250124",
        "name": "computer",
        "display_width_px": desktop.width,
        "display_height_px": desktop.height,
        "display_number": desktop.display_num,
    }

    messages: List[Dict[str, Any]] = [
        {"role": "user", "content": "This is a protocol simulator, not a real desktop. All screenshots are a transparent 1x1 placeholder and actions only update in-memory state. Requested demonstration: " + goal}
    ]

    turn = 0
    while turn < max_turns:
        turn += 1
        logger.info("Turn %d: Calling Anthropic API...", turn)

        response = client.beta.messages.create(
            model=os.environ.get("MODEL", "claude-3-7-sonnet-20250219"),
            max_tokens=2048,
            tools=[computer_tool],
            betas=["computer-use-2025-01-24"],
            messages=messages,
        )

        logger.info("Response stop reason: %s", response.stop_reason)

        # Append assistant message to conversation history
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason != "tool_use":
            logger.info("Protocol simulation finished with API stop reason: %s", response.stop_reason)
            for block in response.content:
                if getattr(block, "type", "") == "text":
                    print(f"\nModel response (protocol simulation; no desktop task was executed):\n{block.text}")
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
                if not action_filter.accepts(action, tool_input):
                    logger.warning("Toy filter rejected simulated action: %s", action)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tool_use_id,
                        "is_error": True,
                        "content": "SimulatedActionRejected: Toy keyword filter rejected this simulated action. No human approval or security boundary is implemented."
                    })
                    continue

                exec_result = desktop.execute_action(**tool_input)

                if action == "screenshot":
                    # For screenshot, return image block inside tool_result
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tool_use_id,
                        "content": [
                            {"type": "text", "text": "simulated: true; transparent 1x1 placeholder, not a desktop screenshot"},
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
    test_goal = os.environ.get("TEST_GOAL", "Demonstrate a screenshot request and cursor movement; no real desktop is available.")
    logger.info("Starting Computer Use protocol simulator")
    run_computer_use_agent(test_goal)
