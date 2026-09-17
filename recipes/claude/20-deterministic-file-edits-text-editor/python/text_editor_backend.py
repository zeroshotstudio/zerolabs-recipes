"""
Deterministic File Editor Backend Handler in Python.

Implements Anthropic's text editor specification:
- Commands: view, create, str_replace, insert, undo_edit
- Strict unique string replacement rules
- Accurate line number prefixes for view
- In-memory undo history stack
"""

import os
import sys
from typing import Any, Dict, List, Optional, Tuple


class TextEditorError(Exception):
    """Exception raised when an editor operation fails constraints."""
    pass


class TextEditorBackend:
    """
    Stateful text editor executing deterministic file modifications.
    Maintains undo history per file path.
    """

    def __init__(self, workspace_root: str):
        self.workspace_root = os.path.abspath(workspace_root)
        self.history: Dict[str, List[str]] = {}

    def _resolve_safe_path(self, path: str) -> str:
        """Resolves target path and ensures it stays within workspace root."""
        if os.path.isabs(path):
            target = os.path.abspath(path)
        else:
            target = os.path.abspath(os.path.join(self.workspace_root, path))

        if not target.startswith(self.workspace_root):
            raise TextEditorError(
                f"Path traversal detected: Path '{path}' resolves outside workspace root '{self.workspace_root}'."
            )
        return target

    def _push_history(self, path: str, content: str) -> None:
        """Stores a snapshot of file content before mutation."""
        if path not in self.history:
            self.history[path] = []
        self.history[path].append(content)

    def view(
        self,
        path: str,
        view_range: Optional[List[int]] = None
    ) -> str:
        """
        Views a file or directory listing.
        Returns numbered lines starting at 1.
        """
        full_path = self._resolve_safe_path(path)

        if not os.path.exists(full_path):
            raise TextEditorError(f"Target path does not exist: {path}")

        if os.path.isdir(full_path):
            entries = os.listdir(full_path)
            entries.sort()
            lines = [f"Directory listing of {path}:"]
            for entry in entries:
                is_dir = os.path.isdir(os.path.join(full_path, entry))
                lines.append(f"{entry}/" if is_dir else entry)
            return "\n".join(lines)

        try:
            with open(full_path, "r", encoding="utf-8") as f:
                lines = f.readlines()
        except UnicodeDecodeError:
            raise TextEditorError(f"Cannot view binary file: {path}")

        total_lines = len(lines)
        if total_lines == 0:
            return f"File '{path}' is empty."

        start_line = 1
        end_line = total_lines

        if view_range:
            if len(view_range) != 2:
                raise TextEditorError("view_range must contain exactly two integers: [start_line, end_line].")
            start_line, end_line = view_range
            if start_line < 1:
                start_line = 1
            if end_line > total_lines or end_line == -1:
                end_line = total_lines
            if start_line > end_line:
                raise TextEditorError(
                    f"Invalid view_range [{start_line}, {end_line}]: start line cannot exceed end line."
                )

        output = []
        for i in range(start_line, end_line + 1):
            line_text = lines[i - 1].rstrip("\r\n")
            output.append(f"{i:6d}\t{line_text}")

        return "\n".join(output)

    def create(self, path: str, file_text: str) -> str:
        """Creates a new file with specified content."""
        full_path = self._resolve_safe_path(path)

        if os.path.exists(full_path):
            raise TextEditorError(
                f"File already exists: {path}. Use str_replace or delete before recreating."
            )

        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(file_text)

        return f"File '{path}' created successfully ({len(file_text)} characters)."

    def str_replace(self, path: str, old_str: str, new_str: str) -> str:
        """
        Replaces exactly one unique occurrence of old_str with new_str.
        Fails if old_str is not found or occurs multiple times.
        """
        full_path = self._resolve_safe_path(path)

        if not os.path.exists(full_path):
            raise TextEditorError(f"File not found: {path}")

        if os.path.isdir(full_path):
            raise TextEditorError(f"Cannot modify directory: {path}")

        with open(full_path, "r", encoding="utf-8") as f:
            content = f.read()

        match_count = content.count(old_str)
        if match_count == 0:
            raise TextEditorError(
                f"Target string not found in '{path}'. "
                "Verify line numbers, leading whitespace, and exact indentation using the 'view' command."
            )
        if match_count > 1:
            raise TextEditorError(
                f"Target string found {match_count} times in '{path}'. "
                "str_replace requires a unique string match. Include more surrounding lines to disambiguate."
            )

        self._push_history(full_path, content)
        updated_content = content.replace(old_str, new_str, 1)

        with open(full_path, "w", encoding="utf-8") as f:
            f.write(updated_content)

        return f"Successfully replaced 1 occurrence in '{path}'."

    def insert(self, path: str, insert_line: int, new_str: str) -> str:
        """Inserts new_str after insert_line (0 inserts at the beginning)."""
        full_path = self._resolve_safe_path(path)

        if not os.path.exists(full_path):
            raise TextEditorError(f"File not found: {path}")

        with open(full_path, "r", encoding="utf-8") as f:
            content = f.read()

        self._push_history(full_path, content)
        lines = content.splitlines(keepends=True)
        total_lines = len(lines)

        if insert_line < 0 or insert_line > total_lines:
            raise TextEditorError(
                f"Invalid insert_line {insert_line}. File '{path}' has {total_lines} lines (valid range: 0 to {total_lines})."
            )

        insert_text = new_str
        if not insert_text.endswith("\n") and (insert_line < total_lines or len(lines) > 0):
            insert_text += "\n"

        if insert_line == 0:
            lines.insert(0, insert_text)
        else:
            lines.insert(insert_line, insert_text)

        updated_content = "".join(lines)
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(updated_content)

        return f"Successfully inserted text after line {insert_line} in '{path}'."

    def undo_edit(self, path: str) -> str:
        """Reverts the most recent edit to the specified file."""
        full_path = self._resolve_safe_path(path)

        if full_path not in self.history or not self.history[full_path]:
            raise TextEditorError(f"No edit history found to undo for '{path}'.")

        previous_content = self.history[full_path].pop()
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(previous_content)

        return f"Reverted file '{path}' to previous state ({len(self.history[full_path])} undo snapshots remaining)."

    def execute_command(self, tool_input: Dict[str, Any]) -> Tuple[bool, str]:
        """
        Dispatches tool command and formats result.
        Returns (is_error, output_message).
        """
        command = tool_input.get("command")
        path = tool_input.get("path")

        if not command or not path:
            return True, "Missing required parameters: 'command' and 'path' must be provided."

        try:
            if command == "view":
                view_range = tool_input.get("view_range")
                res = self.view(path, view_range)
                return False, res

            elif command == "create":
                file_text = tool_input.get("file_text")
                if file_text is None:
                    return True, "Missing parameter 'file_text' for 'create' command."
                res = self.create(path, file_text)
                return False, res

            elif command == "str_replace":
                old_str = tool_input.get("old_str")
                new_str = tool_input.get("new_str")
                if old_str is None or new_str is None:
                    return True, "Missing 'old_str' or 'new_str' for 'str_replace' command."
                res = self.str_replace(path, old_str, new_str)
                return False, res

            elif command == "insert":
                insert_line = tool_input.get("insert_line")
                new_str = tool_input.get("new_str")
                if insert_line is None or new_str is None:
                    return True, "Missing 'insert_line' or 'new_str' for 'insert' command."
                res = self.insert(path, int(insert_line), new_str)
                return False, res

            elif command == "undo_edit":
                res = self.undo_edit(path)
                return False, res

            else:
                return True, f"Unsupported command '{command}'. Supported commands: view, create, str_replace, insert, undo_edit."

        except TextEditorError as err:
            return True, f"TextEditorError: {str(err)}"
        except Exception as err:
            return True, f"InternalError: {type(err).__name__}: {str(err)}"


if __name__ == "__main__":
    import tempfile
    import shutil

    test_dir = tempfile.mkdtemp(prefix="claude_editor_test_")
    try:
        backend = TextEditorBackend(workspace_root=test_dir)
        print(f"Initialized editor backend at: {test_dir}")

        # Test create
        err, out = backend.execute_command({
            "command": "create",
            "path": "test.py",
            "file_text": "def calculate(a, b):\n    return a + b\n"
        })
        print(f"Create: is_error={err} -> {out}")

        # Test view
        err, out = backend.execute_command({
            "command": "view",
            "path": "test.py"
        })
        print(f"View:\n{out}")

        # Test str_replace
        err, out = backend.execute_command({
            "command": "str_replace",
            "path": "test.py",
            "old_str": "    return a + b",
            "new_str": "    # Add two numbers\n    return a + b"
        })
        print(f"Replace: is_error={err} -> {out}")

        # Test ambiguity error
        err, out = backend.execute_command({
            "command": "str_replace",
            "path": "test.py",
            "old_str": "a",
            "new_str": "x"
        })
        print(f"Ambiguous Replace: is_error={err} -> {out}")

        # Test undo
        err, out = backend.execute_command({
            "command": "undo_edit",
            "path": "test.py"
        })
        print(f"Undo: is_error={err} -> {out}")

    finally:
        shutil.rmtree(test_dir)
