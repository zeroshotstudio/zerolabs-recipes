"""Claude shell tool backed only by an unprivileged, bounded Docker container.

The optional host workspace is mounted read-only at /inputs. /workspace and /tmp
are bounded, ephemeral tmpfs mounts. There is no host-shell fallback.
"""

import json
import math
import os
from pathlib import Path
import selectors
import subprocess
import sys
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

BASH_TOOL_DEFINITION = {"type": "bash_20250124", "name": "bash"}
MAX_EXECUTION_TIMEOUT_SECONDS = 20
MAX_OUTPUT_BYTES = 65536
DEFAULT_IMAGE = "zerolabs-bash-sandbox:1.0.0"
# Check actual kernel limits before executing any model-provided command.
SANDBOX_PREFLIGHT = """set -eu
if [ "$(id -u)" = 0 ] ||
   [ "$(cat /sys/fs/cgroup/memory.max)" != 134217728 ] ||
   [ "$(cat /sys/fs/cgroup/memory.swap.max)" != 0 ] ||
   [ "$(cat /sys/fs/cgroup/pids.max)" != 64 ] ||
   [ "$(cat /sys/fs/cgroup/cpu.max)" != "50000 100000" ] ||
   [ "$(ls /sys/class/net)" != lo ]; then
  printf '%s\n' 'Sandbox unavailable: required UID, cgroup v2 or network isolation is not enforced.' >&2
  exit 126
fi
exec bash --noprofile --norc -c "$1"
"""


class BashSandbox:
    """Execute one command in a disposable container; files do not persist.

    Docker and the pre-built, trusted image are required. The daemon remains
    outside the sandbox. Use a dedicated/rootless daemon for hostile workloads;
    containers share the daemon host's kernel and are not a VM security boundary.
    """

    def __init__(
        self,
        working_directory: Optional[str] = None,
        timeout_seconds: float = MAX_EXECUTION_TIMEOUT_SECONDS,
        max_output_bytes: int = MAX_OUTPUT_BYTES,
        use_docker: bool = True,
        container_image: str = DEFAULT_IMAGE,
        docker_socket: str = "/var/run/docker.sock",
    ):
        if not use_docker:
            raise ValueError("Host shell execution is disabled; Docker isolation is required.")
        if not math.isfinite(timeout_seconds) or not 0 < timeout_seconds <= 120:
            raise ValueError("timeout_seconds must be between 0 and 120.")
        if not isinstance(max_output_bytes, int) or not 256 <= max_output_bytes <= 1048576:
            raise ValueError("max_output_bytes must be between 256 and 1048576.")
        if not container_image or container_image.startswith("-"):
            raise ValueError("A trusted, pre-built container image is required.")
        if not os.path.isabs(docker_socket):
            raise ValueError("docker_socket must be an absolute local Unix socket path.")
        self.working_directory = None
        if working_directory is not None:
            workspace = Path(working_directory).resolve(strict=True)
            if not workspace.is_dir() or workspace == Path(workspace.anchor):
                raise ValueError("working_directory must be a dedicated existing input directory.")
            # Docker's --mount syntax cannot quote commas in a source path.
            if "," in str(workspace):
                raise ValueError("working_directory cannot contain a comma.")
            self.working_directory = str(workspace)
        self.timeout_seconds = timeout_seconds
        self.max_output_bytes = max_output_bytes
        self.container_image = container_image
        self.docker_command = ["docker", "--host=unix://" + docker_socket]
        self.uid = os.getuid() or 65534
        self.gid = os.getgid() or 65534

    def _arguments(self, name: str, command: str) -> List[str]:
        args = [
            *self.docker_command, "create", "--rm", "--name", name,
            "--pull", "never", "--stop-timeout", "1", "--log-driver", "none",
            "--network", "none", "--memory", "128m", "--memory-swap", "128m",
            "--cpus", "0.5", "--pids-limit", "64",
            "--ulimit", "nofile=256:256", "--ulimit", "fsize=16777216:16777216",
            "--read-only", "--cap-drop", "ALL",
            "--security-opt", "no-new-privileges", "--user", f"{self.uid}:{self.gid}",
            "--tmpfs", f"/workspace:rw,nosuid,nodev,size=64m,uid={self.uid},gid={self.gid},mode=700",
            "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=16m,mode=1777",
            "--workdir", "/workspace", "--env", "HOME=/workspace", "--env", "LANG=C.UTF-8",
        ]
        # Do not inject host/client proxy credentials into the command environment.
        for key in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "FTP_PROXY",
                    "http_proxy", "https_proxy", "all_proxy", "no_proxy", "ftp_proxy"):
            args.extend(["--env", key + "="])
        if self.working_directory:
            args.extend(["--mount", f"type=bind,src={self.working_directory},dst=/inputs,readonly"])
        args.extend(["--entrypoint", "timeout", self.container_image, "-s", "KILL", str(self.timeout_seconds), "bash", "--noprofile", "--norc", "-c", SANDBOX_PREFLIGHT, "sandbox", command])
        return args

    def _remove_container(self, name: str) -> bool:
        deadline = time.monotonic() + 4
        try:
            subprocess.run(
                [*self.docker_command, "rm", "--force", name],
                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                timeout=2, check=False,
            )
            # Removal can still be in progress after an rm/auto-remove race.
            while time.monotonic() < deadline:
                inspected = subprocess.run(
                    [*self.docker_command, "inspect", "--type", "container", "--format", "{{.Id}}", name],
                    stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    timeout=min(1, max(0.01, deadline - time.monotonic())), check=False,
                )
                if inspected.returncode != 0:
                    # A healthy daemon and no listed container distinguish absence from a broken socket.
                    remaining = subprocess.run(
                        [*self.docker_command, "ps", "--all", "--filter", "name=^/" + name + "$", "--format", "{{.Names}}"],
                        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                        timeout=min(1, max(0.01, deadline - time.monotonic())), check=False,
                    )
                    return remaining.returncode == 0 and not remaining.stdout.strip()
                time.sleep(0.05)
            return False
        except (OSError, subprocess.TimeoutExpired):
            return False

    def _format(self, captured: bytearray, note: str) -> str:
        # Budget the status marker too, and never split a retained UTF-8 character.
        encoded_note = (("\n" + note).encode("utf-8") if note else b"")[:self.max_output_bytes]
        body = bytes(captured[:max(0, self.max_output_bytes - len(encoded_note))])
        return body.decode("utf-8", errors="ignore") + encoded_note.decode("utf-8", errors="ignore")

    def _capture(self, arguments: List[str], deadline: float) -> Tuple[int, bytearray, str]:
        captured = bytearray()
        process = None
        reason = ""
        exit_code = 1
        try:
            process = subprocess.Popen(
                arguments, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            )
            with selectors.DefaultSelector() as selector:
                selector.register(process.stdout, selectors.EVENT_READ)
                while selector.get_map():
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        exit_code, reason = 124, f"Command timed out after {self.timeout_seconds}s."
                        break
                    for key, _ in selector.select(min(remaining, 0.1)):
                        chunk = os.read(key.fileobj.fileno(), 4096)
                        if not chunk:
                            selector.unregister(key.fileobj)
                            continue
                        available = self.max_output_bytes - len(captured)
                        captured.extend(chunk[:available])
                        if len(chunk) > available:
                            exit_code, reason = 125, "Output limit exceeded; container stopped."
                            break
                    if reason:
                        break
                if not reason:
                    try:
                        exit_code = process.wait(timeout=max(0.001, deadline - time.monotonic()))
                    except subprocess.TimeoutExpired:
                        exit_code, reason = 124, f"Command timed out after {self.timeout_seconds}s."
        except OSError as exc:
            reason = f"Sandbox unavailable: {exc}. Host execution is disabled."
        finally:
            if process is not None:
                if process.poll() is None:
                    # Close blocked attach pipes before asking the daemon to remove its container.
                    process.kill()
                process.wait(timeout=5)
                if process.stdout:
                    process.stdout.close()
        return exit_code, captured, reason

    def execute(self, command: str, restart: bool = False) -> Tuple[int, str, bool]:
        if restart:
            return 0, "Session reset: every command uses fresh ephemeral scratch storage.", False
        if not isinstance(command, str) or not command.strip() or "\0" in command:
            return 1, "Execution failed: command must be nonempty text without NUL bytes.", True
        name = "claude-bash-" + uuid.uuid4().hex
        deadline = time.monotonic() + self.timeout_seconds
        exit_code, captured, reason = self._capture(self._arguments(name, command), deadline)
        if exit_code != 0 or reason:
            self._remove_container(name)
            # An accepted create request may finish after a timed-out client and an absence check.
            # Never start it, and never claim that such late metadata is certainly cleaned up.
            reason += f" No command started. Creation cleanup cannot be confirmed; inspect {name}."
            return exit_code or 1, self._format(captured, reason), True
        if time.monotonic() >= deadline:
            removed = self._remove_container(name)
            reason = "Deadline reached before execution; no command started."
            if not removed:
                reason += f" Cleanup could not be confirmed; inspect {name}."
            return 124, self._format(bytearray(), reason), True
        # Only an acknowledged creation can be started. A delayed create never runs model work.
        exit_code, captured, reason = self._capture([*self.docker_command, "start", "--attach", name], deadline)
        if not self._remove_container(name):
            reason += f" Cleanup could not be confirmed; operator must inspect {name}."
            exit_code = exit_code or 1
        output = self._format(captured, reason)
        return exit_code, output or f"(Command exited {exit_code}, no output)", exit_code != 0


def run_sandboxed_bash_agent(
    prompt: str,
    max_turns: int = 5,
    use_docker: bool = True
) -> str:
    """
    Coordinates an agent loop with Claude and the sandboxed Bash tool.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY environment variable is required.")

    from anthropic import Anthropic

    client = Anthropic(api_key=api_key)
    model = os.environ.get("ANTHROPIC_MODEL", "claude-3-7-sonnet-20250219")
    sandbox = BashSandbox(use_docker=use_docker)

    messages: List[Dict[str, Any]] = [
        {"role": "user", "content": prompt}
    ]

    print(f"[*] Starting Sandboxed Bash Agent Loop (Max Turns: {max_turns})...")
    print(f"[*] Prompt: {prompt}\n")

    for turn in range(1, max_turns + 1):
        print(f"--- Turn {turn}/{max_turns} ---")

        response = client.messages.create(
            model=model,
            max_tokens=2048,
            tools=[BASH_TOOL_DEFINITION],
            messages=messages
        )

        # Append assistant response to conversational state
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason == "end_turn":
            print("[+] Claude completed task without further tool invocations.")
            text_blocks = [b.text for b in response.content if hasattr(b, "text")]
            return "\n".join(text_blocks)

        elif response.stop_reason == "tool_use":
            tool_results = []

            for block in response.content:
                if block.type == "tool_use":
                    tool_use_id = block.id
                    tool_name = block.name
                    tool_input = block.input

                    print(f"[Tool Call] ID: {tool_use_id}")
                    print(f"[Tool Call] Name: {tool_name}")
                    print(f"[Tool Call] Input: {tool_input}")

                    if tool_name == "bash":
                        command = tool_input.get("command", "")
                        restart = tool_input.get("restart", False)

                        exit_code, output, is_error = sandbox.execute(command, restart=restart)

                        print(f"[Execution] Exit Code: {exit_code}")
                        print(f"[Execution] Output Preview: {output[:160]}...")
                        print(f"[Execution] is_error: {is_error}\n")

                        tool_result_payload = {
                            "type": "tool_result",
                            "tool_use_id": tool_use_id,
                            "content": output
                        }
                        if is_error:
                            tool_result_payload["is_error"] = True

                        tool_results.append(tool_result_payload)
                    else:
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": tool_use_id,
                            "is_error": True,
                            "content": f"Unknown tool: {tool_name}"
                        })

            messages.append({
                "role": "user",
                "content": tool_results
            })
        else:
            print(f"[!] Unexpected stop reason: {response.stop_reason}")
            break

    return "Agent loop reached maximum turn budget without completion."


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--execute-json":
        request = json.load(sys.stdin)
        code, output, error = BashSandbox().execute(request.get("command", ""), bool(request.get("restart")))
        print(json.dumps({"exitCode": code, "output": output, "isError": error}))
    elif "ANTHROPIC_API_KEY" not in os.environ:
        code, output, error = BashSandbox().execute("id && echo 'Sandbox OK'")
        print(f"Exit Code: {code}\n{output}\nError status: {error}")
        sys.exit(1 if error else 0)
    else:
        print(run_sandboxed_bash_agent("Inspect the container and write a report in /workspace in one command."))
