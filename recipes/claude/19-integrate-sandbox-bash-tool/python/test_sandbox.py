"""Offline fail-safe tests and opt-in real Docker isolation regressions."""
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch

from sandboxed_bash_tool import BashSandbox


class FailSafeTests(unittest.TestCase):
    def test_delayed_create_after_deadline_cannot_start_model_work(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fake_docker = root / "docker"
            metadata = root / "late-created"
            started = root / "model-started"
            calls = root / "calls"
            fake_docker.write_text(
                "#!/usr/bin/env python3\n"
                "import os, subprocess, sys, time\n"
                "from pathlib import Path\n"
                "operation = sys.argv[2]\n"
                f"with open({str(calls)!r}, 'a') as calls: calls.write(operation + '\\n')\n"
                "if operation == 'create':\n"
                f" subprocess.Popen([sys.executable, '-c', 'import sys,time; from pathlib import Path; time.sleep(0.8); Path(sys.argv[1]).write_text(\"created\")', {str(metadata)!r}], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)\n"
                " time.sleep(30)\n"
                "elif operation == 'start':\n"
                f" Path({str(started)!r}).write_text('unsafe model execution')\n"
                "elif operation in ('rm', 'inspect'): sys.exit(1)\n"
            )
            fake_docker.chmod(0o755)
            with patch.dict(os.environ, {"PATH": str(root) + os.pathsep + os.environ["PATH"]}):
                code, output, error = BashSandbox(timeout_seconds=0.1).execute("echo untrusted-model-command")
            self.assertEqual(code, 124, output)
            self.assertTrue(error)
            self.assertIn("No command started", output)
            self.assertIn("Creation cleanup cannot be confirmed", output)
            self.assertNotIn("start", calls.read_text().splitlines())
            time.sleep(1)
            self.assertTrue(metadata.exists(), "The fake daemon must finish its delayed create after timeout")
            self.assertFalse(started.exists())

    def test_host_fallback_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Host shell execution is disabled"):
            BashSandbox(use_docker=False)

    def test_unavailable_daemon_never_executes_on_host(self):
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / "must-not-exist"
            code, _, error = BashSandbox(docker_socket=str(Path(directory) / "absent.sock")).execute(
                "touch " + shlex.quote(str(marker))
            )
            self.assertTrue(error)
            self.assertNotEqual(code, 0)
            self.assertFalse(marker.exists())

    def test_restart_preserves_host_inputs(self):
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / "input.txt"
            marker.write_text("retained")
            self.assertEqual(BashSandbox(working_directory=directory).execute("", restart=True)[0], 0)
            self.assertEqual(marker.read_text(), "retained")

    def test_invalid_resource_limits_and_host_root_rejected(self):
        for options in ({"timeout_seconds": 0}, {"timeout_seconds": float("nan")},
                        {"timeout_seconds": 121}, {"max_output_bytes": -1}, {"working_directory": "/"}):
            with self.subTest(options=options), self.assertRaises(ValueError):
                BashSandbox(**options)


@unittest.skipUnless(os.environ.get("RUN_SANDBOX_DOCKER_TESTS") == "1", "set RUN_SANDBOX_DOCKER_TESTS=1 for real isolation checks")
class DockerIsolationTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which("jq"), "cURL probe regression requires jq")
    def test_curl_probe_never_evaluates_model_commands_on_host(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            marker = root / "host-write"
            payload_record = root / "payload.json"
            fake_curl = root / "curl"
            fake_curl.write_text(
                "#!/usr/bin/env python3\n"
                "import json, os, sys\n"
                "request = json.loads(sys.argv[sys.argv.index('-d') + 1])\n"
                "if len(request['messages']) == 1:\n"
                " print(json.dumps({'stop_reason': 'tool_use', 'content': [{'type': 'tool_use', 'name': 'bash', 'id': 'tool_probe', 'input': {'command': os.environ['SANDBOX_TEST_COMMAND']}}]}))\n"
                "else:\n"
                " with open(os.environ['SANDBOX_TEST_PAYLOAD'], 'w') as record: json.dump(request, record)\n"
                " print(json.dumps({'content': [{'type': 'text', 'text': 'Probe complete'}]}))\n"
            )
            fake_curl.chmod(0o755)
            environment = {**os.environ, "PATH": str(root) + os.pathsep + os.environ["PATH"],
                           "ANTHROPIC_API_KEY": "synthetic-test-key",
                           "SANDBOX_TEST_COMMAND": "touch " + shlex.quote(str(marker)),
                           "SANDBOX_TEST_PAYLOAD": str(payload_record)}
            result = subprocess.run(["bash", str(Path(__file__).resolve().parents[1] / "curl_probe.sh")],
                                    env=environment, capture_output=True, text=True, timeout=30, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse(marker.exists())
            returned = json.loads(payload_record.read_text())["messages"][-1]["content"][0]
            self.assertEqual(returned["tool_use_id"], "tool_probe")
            self.assertTrue(returned["is_error"])

    def test_host_escape_and_write_probes_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            marker = root / "private-marker"
            marker.write_text("HOST_SECRET_MARKER")
            inputs = root / "inputs"
            inputs.mkdir()
            (inputs / "allowed.txt").write_text("allowed-input")
            (inputs / "escape").symlink_to(marker)
            # The container user must be able to read the explicit input directory.
            root.chmod(0o755)
            inputs.chmod(0o755)
            runner = BashSandbox(working_directory=str(inputs))
            self.assertEqual(runner.execute("cat /inputs/allowed.txt")[:2], (0, "allowed-input"))
            for command in ("cat " + shlex.quote(str(marker)), "cat /inputs/escape",
                            "echo changed > /inputs/allowed.txt", "touch /etc/host-write"):
                with self.subTest(command=command):
                    code, output, error = runner.execute(command)
                    self.assertTrue(error)
                    self.assertNotEqual(code, 0)
                    self.assertNotIn("HOST_SECRET_MARKER", output)
            self.assertEqual((inputs / "allowed.txt").read_text(), "allowed-input")
            self.assertEqual(marker.read_text(), "HOST_SECRET_MARKER")

    def test_unprivileged_no_network_and_real_resource_limits(self):
        runner = BashSandbox()
        code, output, error = runner.execute(
            "id -u; cat /sys/fs/cgroup/memory.max /sys/fs/cgroup/memory.swap.max "
            "/sys/fs/cgroup/pids.max /sys/fs/cgroup/cpu.max; "
            "df -k /workspace | tail -1 | awk '{print $2}'; ulimit -f; ulimit -n"
        )
        self.assertFalse(error, output)
        values = output.strip().splitlines()
        self.assertNotEqual(values[0], "0")
        self.assertEqual(values[1:], ["134217728", "0", "64", "50000 100000", "65536", "16384", "256"])
        code, _, error = runner.execute("echo probe > /dev/tcp/1.1.1.1/443")
        self.assertTrue(error)
        self.assertNotEqual(code, 0)

    def test_output_and_descendant_timeout_remove_container(self):
        for options, command, expected in (
            ({"max_output_bytes": 512}, "echo $HOSTNAME; yes '😀'", 125),
            ({"timeout_seconds": 1}, "echo $HOSTNAME; sleep 30 & wait", 124),
        ):
            with self.subTest(options=options):
                start = time.monotonic()
                code, output, error = BashSandbox(**options).execute(command)
                self.assertTrue(error)
                self.assertEqual(code, expected, output)
                self.assertLessEqual(len(output.encode("utf-8")), options.get("max_output_bytes", 65536))
                self.assertLess(time.monotonic() - start, 7)
                container_id = output.splitlines()[0]
                self.assertRegex(container_id, r"^[a-f0-9]{12}$")
                result = subprocess.run(["docker", "--host=unix:///var/run/docker.sock", "inspect", container_id],
                                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
                self.assertNotEqual(result.returncode, 0, "Timed-out/output-limited container must be gone")

    def test_scratch_is_ephemeral_and_storage_bounded(self):
        runner = BashSandbox()
        self.assertEqual(runner.execute("echo scratch > /workspace/example")[0], 0)
        self.assertEqual(runner.execute("test ! -e /workspace/example")[0], 0)
        code, _, error = runner.execute("for n in 1 2 3 4 5 6; do dd if=/dev/zero of=/workspace/file$n bs=1M count=12 || exit 1; done")
        self.assertTrue(error)
        self.assertNotEqual(code, 0)


if __name__ == "__main__":
    unittest.main()
