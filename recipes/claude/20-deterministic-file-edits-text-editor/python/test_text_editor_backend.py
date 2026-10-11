"""Offline containment regressions; no model credentials or filesystem escape."""
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from text_editor_backend import TextEditorBackend, TextEditorError


class EditorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="editor-security-")
        self.base = Path(self.temp.name)
        self.root = self.base / "workspace"
        self.root.mkdir(mode=0o700)
        self.outside = self.base / "workspace-other"
        self.outside.mkdir(mode=0o700)
        self.marker = self.outside / "private.txt"
        self.marker.write_text("outside secret\n")
        self.backend = TextEditorBackend(str(self.root))

    def tearDown(self):
        self.backend.close()
        self.temp.cleanup()

    def assertBlocked(self, method, *args):
        with self.assertRaises(TextEditorError):
            method(*args)
        self.assertEqual(self.marker.read_text(), "outside secret\n")

    def allExistingOperationsBlocked(self, target):
        self.assertBlocked(self.backend.view, target)
        self.assertBlocked(self.backend.create, target, "overwrite")
        self.assertBlocked(self.backend.str_replace, target, "secret", "overwrite")
        self.assertBlocked(self.backend.insert, target, 0, "overwrite")
        self.assertBlocked(self.backend.undo_edit, target)

    def test_sibling_prefix_absolute_and_relative_traversal(self):
        for target in (str(self.marker), "../workspace-other/private.txt", "child/../../workspace-other/private.txt"):
            with self.subTest(target=target):
                self.allExistingOperationsBlocked(target)
        self.assertBlocked(self.backend.create, "../workspace-other/new/deep.txt", "overwrite")
        self.assertFalse((self.outside / "new").exists())

    def test_external_internal_and_dangling_symlinks(self):
        (self.root / "external").symlink_to(self.outside, target_is_directory=True)
        (self.root / "file-link").symlink_to(self.marker)
        (self.root / "dangling").symlink_to(self.outside / "new.txt")
        self.backend.create("local.txt", "local")
        (self.root / "internal").symlink_to(self.root / "local.txt")
        for target in ("external/private.txt", "file-link", "dangling", "internal"):
            with self.subTest(target=target):
                self.allExistingOperationsBlocked(target)
        self.assertBlocked(self.backend.create, "external/new/deep.txt", "overwrite")
        self.assertFalse((self.outside / "new").exists())
        self.assertFalse((self.outside / "new.txt").exists())
        self.assertEqual((self.root / "local.txt").read_text(), "local")

    def test_final_symlink_swap_after_preflight(self):
        self.backend.create("target.txt", "local")
        original = self.backend._resolve_safe_path
        def swap(path):
            resolved = original(path)
            (self.root / "target.txt").rename(self.root / "saved.txt")
            (self.root / "target.txt").symlink_to(self.marker)
            return resolved
        with patch.object(self.backend, "_resolve_safe_path", side_effect=swap):
            self.assertBlocked(self.backend.str_replace, "target.txt", "secret", "overwrite")
        self.assertEqual((self.root / "saved.txt").read_text(), "local")

    def test_parent_symlink_swap_after_preflight_create(self):
        (self.root / "parent").mkdir()
        original = self.backend._resolve_safe_path
        def swap(path):
            resolved = original(path)
            (self.root / "parent").rename(self.root / "saved-parent")
            (self.root / "parent").symlink_to(self.outside, target_is_directory=True)
            return resolved
        with patch.object(self.backend, "_resolve_safe_path", side_effect=swap):
            self.assertBlocked(self.backend.create, "parent/new.txt", "overwrite")
        self.assertFalse((self.outside / "new.txt").exists())

    def test_opened_parent_stays_anchored_after_name_is_replaced(self):
        (self.root / "parent").mkdir()
        original_open = os.open
        def replace_after_open(path, flags, *args, **kwargs):
            fd = original_open(path, flags, *args, **kwargs)
            if path == "parent" and flags & os.O_DIRECTORY:
                (self.root / "parent").rename(self.root / "saved-parent")
                (self.root / "parent").symlink_to(self.outside, target_is_directory=True)
            return fd
        with patch("text_editor_backend.os.open", side_effect=replace_after_open):
            self.backend.create("parent/new.txt", "local")
        self.assertEqual((self.root / "saved-parent" / "new.txt").read_text(), "local")
        self.assertFalse((self.outside / "new.txt").exists())

    def test_rejected_undo_keeps_history_and_insert_after_unterminated_line(self):
        self.backend.create("target.txt", "one")
        self.backend.insert("target.txt", 1, "two")
        self.assertEqual((self.root / "target.txt").read_text(), "one\n" "two\n")
        (self.root / "target.txt").rename(self.root / "saved.txt")
        (self.root / "target.txt").symlink_to(self.marker)
        self.assertBlocked(self.backend.undo_edit, "target.txt")
        (self.root / "target.txt").unlink()
        (self.root / "saved.txt").rename(self.root / "target.txt")
        self.backend.undo_edit("target.txt")
        self.assertEqual((self.root / "target.txt").read_text(), "one")

    def test_hardlinks_special_files_and_shared_directories(self):
        os.link(self.marker, self.root / "hardlink")
        self.allExistingOperationsBlocked("hardlink")
        os.mkfifo(self.root / "fifo", 0o600)
        self.assertBlocked(self.backend.view, "fifo")
        self.assertBlocked(self.backend.insert, "fifo", 0, "overwrite")
        (self.root / "shared").mkdir(mode=0o777)
        (self.root / "shared").chmod(0o777)
        self.assertBlocked(self.backend.create, "shared/new.txt", "overwrite")
        self.assertFalse((self.root / "shared" / "new.txt").exists())

    def test_exclusive_workspace_lock_and_close(self):
        self.assertBlocked(TextEditorBackend, str(self.root))
        self.assertTrue((self.root / ".text-editor.lock").exists())
        self.assertBlocked(self.backend.view, ".text-editor.lock")
        self.assertNotIn(".text-editor.lock", self.backend.view("."))
        self.backend.close()
        with TextEditorBackend(str(self.root)) as second:
            second.create("second.txt", "ok")
        self.assertBlocked(self.backend.view, ".")

    def test_legitimate_create_replace_insert_view_and_undo(self):
        self.backend.create("nested/deep/script.py", "one\ntwo\n")
        target = "nested/deep/script.py"
        self.assertEqual(self.backend.view(target, [2, -1]), "     2\ttwo")
        self.backend.str_replace(target, "one", "new")
        self.backend.insert(target, 1, "middle")
        self.assertEqual((self.root / target).read_text(), "new\nmiddle\ntwo\n")
        self.backend.undo_edit(target)
        self.backend.undo_edit(target)
        self.assertEqual((self.root / target).read_text(), "one\ntwo\n")
        self.assertBlocked(self.backend.undo_edit, target)
        self.assertBlocked(self.backend.create, target, "clobber")
        self.assertBlocked(self.backend.insert, target, 500, "invalid")
        self.assertBlocked(self.backend.str_replace, target, "", "invalid")
        self.assertBlocked(self.backend.str_replace, target, "o", "ambiguous")
        self.assertBlocked(self.backend.undo_edit, target)
        self.assertEqual((self.root / target).read_text(), "one\ntwo\n")

    def test_binary_and_invalid_paths_return_errors(self):
        (self.root / "binary").write_bytes(b"\xff\xfe")
        for command in ({"command": "view", "path": "binary"}, {"command": "view", "path": "bad\0path"}):
            error, _ = self.backend.execute_command(command)
            self.assertTrue(error)


if __name__ == "__main__":
    unittest.main()
