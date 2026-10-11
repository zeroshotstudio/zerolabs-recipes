"""
Deterministic File Editor Backend Handler in Python.

Implements Anthropic's text editor specification:
- Commands: view, create, str_replace, insert, undo_edit
- Strict unique string replacement rules
- Accurate line number prefixes for view
- In-memory undo history stack
"""

import os
import stat
import threading
from contextlib import contextmanager
from typing import Any, Dict, List, Optional, Tuple


class TextEditorError(Exception):
    """Exception raised when an editor operation fails constraints."""


class TextEditorBackend:
    """Single-writer editor for a private POSIX workspace.

    Every path component is opened relative to a held directory descriptor with
    O_NOFOLLOW. Symlinks, hard-linked files, special files, and shared writable
    directories are rejected. This is not isolation from another process running
    as the same user: use a dedicated container/mount for hostile host writers.
    """

    _LOCK_NAME = ".text-editor.lock"

    def __init__(self, workspace_root: str):
        if os.name != "posix" or not hasattr(os, "O_NOFOLLOW") or os.open not in os.supports_dir_fd:
            raise TextEditorError("This backend requires POSIX descriptor-relative, no-follow filesystem operations.")
        self.workspace_root = os.path.realpath(workspace_root)
        self.history: Dict[str, List[str]] = {}
        self._mutex = threading.RLock()
        self._root_fd = None
        self._lock_owned = False
        try:
            self._root_fd = os.open(self.workspace_root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            self._check_private(os.fstat(self._root_fd), directory=True)
            lock_fd = os.open(self._LOCK_NAME, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW,
                              0o600, dir_fd=self._root_fd)
            self._lock_owned = True
            try:
                os.write(lock_fd, f"{os.getpid()}\n".encode())
            finally:
                os.close(lock_fd)
        except OSError as err:
            self.close()
            raise TextEditorError(f"Cannot acquire private workspace: {err}") from err
        except Exception:
            self.close()
            raise

    def close(self) -> None:
        """Release the workspace lock. Call after the final operation."""
        with self._mutex:
            if self._root_fd is not None:
                try:
                    if self._lock_owned:
                        os.unlink(self._LOCK_NAME, dir_fd=self._root_fd)
                finally:
                    self._lock_owned = False
                    os.close(self._root_fd)
                    self._root_fd = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    def __del__(self):
        try:
            self.close()
        except Exception:
            pass

    @staticmethod
    def _check_private(info, directory: bool = False) -> None:
        if info.st_uid != os.geteuid() or info.st_mode & 0o022:
            raise TextEditorError("Workspace entries must be owned by the editor user and not group/world writable.")
        if directory:
            if not stat.S_ISDIR(info.st_mode):
                raise TextEditorError("Expected a workspace directory.")
        elif not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise TextEditorError("Only regular files with one hard link can be edited or viewed.")

    def _resolve_safe_path(self, path: str) -> str:
        """Check lexical and canonical ancestry, including existing create parents.

        This preflight improves diagnostics; descriptor traversal below enforces
        the boundary even if a symlink is substituted after this check.
        """
        if not isinstance(path, str) or not path or "\0" in path:
            raise TextEditorError("Path must be a nonempty string without NUL characters.")
        target = os.path.abspath(os.path.join(self.workspace_root, path))
        canonical = os.path.realpath(target)
        if (os.path.commonpath([target, self.workspace_root]) != self.workspace_root
                or os.path.commonpath([canonical, self.workspace_root]) != self.workspace_root):
            raise TextEditorError(f"Path traversal detected: '{path}' resolves outside workspace root.")
        if self._LOCK_NAME in os.path.relpath(target, self.workspace_root).split(os.sep):
            raise TextEditorError("The workspace lock is reserved for the backend.")
        return target

    @contextmanager
    def _open_target(self, path: str, flags: int = os.O_RDONLY, create_parents: bool = False):
        """Open without ever following a workspace symlink or re-resolving its root."""
        with self._mutex:
            if self._root_fd is None:
                raise TextEditorError("The editor is closed.")
            full_path = self._resolve_safe_path(path)
            relative = os.path.relpath(full_path, self.workspace_root)
            parts = [] if relative == "." else relative.split(os.sep)
            parent_fd = os.dup(self._root_fd)
            target_fd = None
            try:
                for part in parts[:-1]:
                    if create_parents:
                        try:
                            os.mkdir(part, 0o700, dir_fd=parent_fd)
                        except FileExistsError:
                            pass
                    next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent_fd)
                    try:
                        self._check_private(os.fstat(next_fd), directory=True)
                    except Exception:
                        os.close(next_fd)
                        raise
                    os.close(parent_fd)
                    parent_fd = next_fd
                if parts:
                    target_fd = os.open(parts[-1], flags | os.O_NOFOLLOW | os.O_NONBLOCK,
                                        0o600, dir_fd=parent_fd)
                else:
                    if flags != os.O_RDONLY:
                        raise TextEditorError("Cannot modify the workspace directory.")
                    target_fd = os.dup(parent_fd)
                info = os.fstat(target_fd)
                self._check_private(info, directory=stat.S_ISDIR(info.st_mode) and flags == os.O_RDONLY)
                yield full_path, target_fd
            except OSError as err:
                raise TextEditorError(f"Unsafe or unavailable workspace path '{path}': {err.strerror}.") from err
            finally:
                if target_fd is not None:
                    os.close(target_fd)
                os.close(parent_fd)

    @staticmethod
    def _read(fd: int) -> str:
        os.lseek(fd, 0, os.SEEK_SET)
        with os.fdopen(os.dup(fd), "r", encoding="utf-8", newline="") as stream:
            return stream.read()

    @staticmethod
    def _write(fd: int, content: str) -> None:
        os.lseek(fd, 0, os.SEEK_SET)
        with os.fdopen(os.dup(fd), "w", encoding="utf-8", newline="") as stream:
            stream.write(content)
            stream.flush()
            stream.truncate()

    def _push_history(self, path: str, content: str) -> None:
        snapshots = self.history.setdefault(path, [])
        snapshots.append(content)
        del snapshots[:-50]

    def view(self, path: str, view_range: Optional[List[int]] = None) -> str:
        """View numbered UTF-8 lines or a directory without following its entries."""
        with self._open_target(path) as (_, fd):
            if stat.S_ISDIR(os.fstat(fd).st_mode):
                lines = [f"Directory listing of {path}:"]
                for entry in sorted(os.listdir(fd)):
                    if entry == self._LOCK_NAME:
                        continue
                    info = os.stat(entry, dir_fd=fd, follow_symlinks=False)
                    lines.append(f"{entry}/" if stat.S_ISDIR(info.st_mode) else entry)
                return "\n".join(lines)
            try:
                lines = self._read(fd).splitlines()
            except UnicodeDecodeError as err:
                raise TextEditorError(f"Cannot view binary file: {path}") from err
        if not lines:
            return f"File '{path}' is empty."
        start_line, end_line = 1, len(lines)
        if view_range is not None:
            if len(view_range) != 2 or any(type(i) is not int for i in view_range):
                raise TextEditorError("view_range must contain exactly two integers: [start_line, end_line].")
            start_line = max(1, view_range[0])
            end_line = len(lines) if view_range[1] == -1 else min(len(lines), view_range[1])
            if start_line > end_line:
                raise TextEditorError("Invalid view_range: start line cannot exceed end line.")
        return "\n".join(f"{i:6d}\t{lines[i - 1]}" for i in range(start_line, end_line + 1))

    def create(self, path: str, file_text: str) -> str:
        """Create exclusively; a late symlink or existing file is never overwritten."""
        if not isinstance(file_text, str):
            raise TextEditorError("file_text must be a string.")
        with self._open_target(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, create_parents=True) as (_, fd):
            self._write(fd, file_text)
        return f"File '{path}' created successfully ({len(file_text)} characters)."

    def str_replace(self, path: str, old_str: str, new_str: str) -> str:
        if not isinstance(old_str, str) or not old_str or not isinstance(new_str, str):
            raise TextEditorError("old_str must be nonempty and both replacement parameters must be strings.")
        with self._open_target(path, os.O_RDWR) as (full_path, fd):
            content = self._read(fd)
            matches = content.count(old_str)
            if matches != 1:
                raise TextEditorError(f"Target string found {matches} times in '{path}'; str_replace requires a unique match.")
            self._write(fd, content.replace(old_str, new_str, 1))
            self._push_history(full_path, content)
        return f"Successfully replaced 1 occurrence in '{path}'."

    def insert(self, path: str, insert_line: int, new_str: str) -> str:
        if not isinstance(new_str, str):
            raise TextEditorError("new_str must be a string.")
        with self._open_target(path, os.O_RDWR) as (full_path, fd):
            content = self._read(fd)
            lines = content.splitlines(keepends=True)
            if type(insert_line) is not int or insert_line < 0 or insert_line > len(lines):
                raise TextEditorError(f"Invalid insert_line {insert_line}; valid range is 0 to {len(lines)}.")
            insert_text = new_str
            if not insert_text.endswith("\n") and lines:
                insert_text += "\n"
            if insert_line == len(lines) and lines and not lines[-1].endswith("\n"):
                lines[-1] += "\n"
            lines.insert(insert_line, insert_text)
            self._write(fd, "".join(lines))
            self._push_history(full_path, content)
        return f"Successfully inserted text after line {insert_line} in '{path}'."

    def undo_edit(self, path: str) -> str:
        with self._open_target(path, os.O_RDWR) as (full_path, fd):
            history = self.history.get(full_path)
            if not history:
                raise TextEditorError(f"No edit history found to undo for '{path}'.")
            self._write(fd, history[-1])
            history.pop()
        return f"Reverted file '{path}' to previous state ({len(history)} undo snapshots remaining)."

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
                res = self.insert(path, insert_line, new_str)
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
        backend.close()
        shutil.rmtree(test_dir)
