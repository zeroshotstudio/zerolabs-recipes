"""
Main interactive and agent loop demonstration using Anthropic Text Editor Tool.
"""

import os
import sys
import tempfile
import json
try:
    from anthropic import Anthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False
from text_editor_backend import TextEditorBackend

# Configuration
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
MODEL_NAME = os.environ.get("ANTHROPIC_MODEL", "claude-3-7-sonnet-20250219")

# Text Editor Tool specification matching Anthropic's built-in tool
TEXT_EDITOR_TOOL = {
    "type": "text_editor_20250124",
    "name": "str_replace_editor"
}


def run_agentic_edit_loop(user_prompt: str, workspace_root: str):
    """Executes a multi-turn agent loop with Claude and the local editor backend."""
    if not HAS_ANTHROPIC or not ANTHROPIC_API_KEY:
        print("Anthropic SDK not installed or ANTHROPIC_API_KEY not set. Operating in offline simulation mode.")
        _run_simulation(user_prompt, workspace_root)
        return

    client = Anthropic(api_key=ANTHROPIC_API_KEY)
    backend = TextEditorBackend(workspace_root=workspace_root)

    messages = [
        {"role": "user", "content": user_prompt}
    ]

    max_turns = 5
    current_turn = 0

    print(f"Starting agent edit loop for workspace: {workspace_root}")
    print(f"User Prompt: {user_prompt}\n")

    while current_turn < max_turns:
        current_turn += 1
        print(f"--- Turn {current_turn} ---")

        response = client.messages.create(
            model=MODEL_NAME,
            max_tokens=2048,
            tools=[TEXT_EDITOR_TOOL],
            messages=messages
        )

        print(f"Stop reason: {response.stop_reason}")

        # Accumulate assistant message
        messages.append({
            "role": "assistant",
            "content": response.content
        })

        if response.stop_reason == "end_turn":
            for block in response.content:
                if block.type == "text":
                    print(f"Claude: {block.text}")
            print("\nTask completed successfully.")
            break

        if response.stop_reason == "tool_use":
            tool_results = []
            for block in response.content:
                if block.type == "text":
                    print(f"Claude thoughts: {block.text}")
                elif block.type == "tool_use":
                    print(f"Executing tool: {block.name} (id: {block.id})")
                    print(f"Parameters: {json.dumps(block.input, indent=2)}")

                    is_error, output = backend.execute_command(block.input)
                    print(f"Result (is_error={is_error}):\n{output}\n")

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "is_error": is_error,
                        "content": output
                    })

            messages.append({
                "role": "user",
                "content": tool_results
            })


def _run_simulation(user_prompt: str, workspace_root: str):
    """Simulates multi-turn interaction when running without API key."""
    backend = TextEditorBackend(workspace_root=workspace_root)

    # 1. Create file
    backend.execute_command({
        "command": "create",
        "path": "sample.py",
        "file_text": "def calculate(a, b):\n    return a + b\n"
    })
    print("Created sample.py")

    # 2. View file
    _, view_out = backend.execute_command({"command": "view", "path": "sample.py"})
    print(f"View output:\n{view_out}")

    # 3. Unique string replace
    is_err, rep_out = backend.execute_command({
        "command": "str_replace",
        "path": "sample.py",
        "old_str": "    return a + b",
        "new_str": "    # Multiplied result\n    return a * b"
    })
    print(f"Replace output (is_error={is_err}): {rep_out}")

    # 4. View updated
    _, view_out2 = backend.execute_command({"command": "view", "path": "sample.py"})
    print(f"Updated content:\n{view_out2}")


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="agent_edit_") as temp_dir:
        prompt = "Create a python script math_utils.py with an add function, then update it to include docstrings."
        run_agentic_edit_loop(prompt, temp_dir)
