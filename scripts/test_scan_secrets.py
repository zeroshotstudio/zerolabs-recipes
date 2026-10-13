"""Offline regressions for provider-key detection and fail-closed scanning."""

import contextlib
import io
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import scan_secrets


SCANNER = Path(scan_secrets.__file__).resolve()


class SecretScannerTests(unittest.TestCase):
    def test_current_provider_formats(self):
        for prefix in ("sk-", "sk-proj-", "sk-svcacct-", "sk-ant-api03-"):
            with self.subTest(prefix=prefix):
                key = prefix + "aB3_9-" * 8
                findings = scan_secrets.scan_text(f'API_KEY="{key}"', "sample.env")
                self.assertEqual(len(findings), 1)
                self.assertEqual(findings[0]["line"], 1)
                self.assertNotIn(key, repr(findings))

    def test_placeholders_and_example_host_never_exempt_neighboring_keys(self):
        key = "sk-" + "aB39" * 8
        for neighbor in ("example.com", "PLACEHOLDER", "mock-key", "0000000000", "your_api_key_here"):
            with self.subTest(neighbor=neighbor):
                self.assertEqual(len(scan_secrets.scan_text(f'{neighbor} KEY="{key}"')), 1)
        self.assertEqual(len(scan_secrets.scan_text(key + " " + key)), 2)

    def test_only_complete_placeholder_values_are_exempt(self):
        self.assertFalse(scan_secrets.scan_text("sk-ant-api03-your-api-key-here"))
        self.assertFalse(scan_secrets.scan_text("postgres://operator:your_secret_here@example.com/db"))
        self.assertFalse(scan_secrets.scan_text("postgres://operator:${DB_PASSWORD:-placeholder}@example.com/db"))
        self.assertTrue(scan_secrets.scan_text("postgres://" + "operator:real-password@example.com/db"))
        key = "sk-proj-" + "aB39" * 8 + "PLACEHOLDER"
        self.assertTrue(scan_secrets.scan_text(key))

    def test_read_errors_fail_closed(self):
        with patch.object(Path, "read_bytes", side_effect=PermissionError("denied")):
            with self.assertRaises(scan_secrets.ScanError):
                scan_secrets.scan_file(Path("sample.env"))
        with patch.object(scan_secrets.os, "walk") as walk:
            walk.side_effect = lambda *args, **kwargs: kwargs["onerror"](PermissionError("denied"))
            with self.assertRaises(scan_secrets.ScanError):
                scan_secrets.scan_directory(Path("sample"))

    def test_staged_and_unstaged_diffs_scan_index_content_and_line_numbers(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "--quiet", directory], check=True)
            # Paths quoted by textual diffs must retain their actual name.
            sample = root / "sample\tkeys.env"
            key = "sk-ant-api03-" + "aB39_" * 8
            sample.write_text(f"# example.com\n++KEY={key} # PLACEHOLDER\n")
            subprocess.run(["git", "-C", directory, "add", "."], check=True)
            # Workspace content can differ from the content being committed.
            sample.write_text("# clean workspace\n")
            with patch.object(scan_secrets.subprocess, "run", wraps=subprocess.run) as run:
                with contextlib.chdir(root):
                    findings = scan_secrets.scan_git_diff(cached=True)
                    self.assertEqual(len(findings), 1)
                    self.assertEqual(findings[0]["source"], sample.name)
                    self.assertEqual(findings[0]["line"], 2)
                    self.assertFalse(scan_secrets.scan_git_diff(cached=False))
                self.assertIn("--no-ext-diff", run.call_args_list[0].args[0])

    def test_cli_redacts_the_whole_source_line(self):
        with tempfile.TemporaryDirectory() as directory:
            key = "sk-proj-" + "aB3_9-" * 8
            sample = Path(directory) / (key + ".env")
            sample.write_text(f'KEY={key} NEIGHBORING_SECRET=never-print-this\n')
            result = subprocess.run([sys.executable, str(SCANNER), str(sample)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertIn("[REDACTED].env:1", result.stdout)
            self.assertIn("[REDACTED]", result.stdout)
            self.assertNotIn(key, result.stdout + result.stderr)
            self.assertNotIn("never-print-this", result.stdout + result.stderr)

    def test_cli_git_failure_and_missing_path_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            for args in (["--git-staged"], [str(Path(directory) / "missing")]):
                result = subprocess.run([sys.executable, str(SCANNER), *args], cwd=directory, capture_output=True, text=True)
                self.assertEqual(result.returncode, 2)
                self.assertNotIn("No sensitive", result.stdout)
                self.assertIn("Error:", result.stderr)
        with patch.object(sys, "argv", [str(SCANNER), "sample.env"]), \
                patch.object(Path, "is_file", return_value=True), \
                patch.object(Path, "read_bytes", side_effect=PermissionError("denied")), \
                contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as error:
                scan_secrets.main()
            self.assertEqual(error.exception.code, 2)

    def test_unicode_and_binary_staged_blobs_are_scanned(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "--quiet", directory], check=True)
            key = "sk-proj-" + "aB39_" * 8
            for encoding in ("utf-16", "utf-32", "utf-8-sig"):
                sample = root / (encoding + ".env")
                sample.write_text("KEY=" + key + "\n", encoding=encoding)
                self.assertEqual(len(scan_secrets.scan_file(sample)), 1)
            binary = root / "asset.bin"
            binary.write_bytes(b"\x00\xffKEY=" + key.encode() + b"\x00")
            padded = root / "padded.bin"
            padded.write_bytes(("KEY=" + key).encode("utf-16-le"))
            subprocess.run(["git", "-C", directory, "add", "."], check=True)
            for sample in root.glob("*.env"):
                sample.write_text("clean workspace\n")
            binary.write_bytes(b"clean workspace")
            with contextlib.chdir(root):
                findings = scan_secrets.scan_git_diff(cached=True)
            self.assertEqual(len(findings), 5)
            self.assertNotIn(key, repr(findings))

    def test_unsupported_or_malformed_text_encoding_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            sample = Path(directory) / "sample.env"
            key = "sk-ant-api03-" + "aB39_" * 8
            for data in (("KEY=" + key).encode("utf-16-le"), b"\xff\xfex"):
                sample.write_bytes(data)
                with self.assertRaises(scan_secrets.ScanError):
                    scan_secrets.scan_file(sample)
                result = subprocess.run([sys.executable, str(SCANNER), str(sample)], capture_output=True, text=True)
                self.assertEqual(result.returncode, 2)
                self.assertNotIn("No sensitive", result.stdout)

    def test_lockfiles_and_errors_do_not_have_filename_exemptions(self):
        with tempfile.TemporaryDirectory() as directory:
            key = "sk-proj-" + "aB39_" * 8
            sample = Path(directory) / "package-lock.json"
            sample.write_text('{"credential": "' + key + '"}')
            self.assertEqual(len(scan_secrets.scan_file(sample)), 1)
            missing = Path(directory) / (key + ".env")
            result = subprocess.run([sys.executable, str(SCANNER), str(missing)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertNotIn(key, result.stdout + result.stderr)
            self.assertIn("[REDACTED].env", result.stderr)

    def test_staged_colon_filename_is_literal_and_type_changes_are_scanned(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "--quiet", directory], check=True)
            key = "sk-proj-" + "aB39_" * 8
            (root / "real.env").write_text("clean\n")
            (root / "0:real.env").write_text("KEY=" + key + "\n")
            subprocess.run(["git", "-C", directory, "add", "."], check=True)
            with contextlib.chdir(root):
                findings = scan_secrets.scan_git_diff(cached=True)
            self.assertEqual(len(findings), 1)
            self.assertEqual(findings[0]["source"], "0:real.env")
            subprocess.run(["git", "-C", directory, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--quiet", "-m", "fixture"], check=True)
            changed = root / "real.env"
            changed.unlink()
            changed.symlink_to(key)
            subprocess.run(["git", "-C", directory, "add", "real.env"], check=True)
            with contextlib.chdir(root):
                self.assertEqual(len(scan_secrets.scan_git_diff(cached=True)), 1)


if __name__ == "__main__":
    unittest.main()
