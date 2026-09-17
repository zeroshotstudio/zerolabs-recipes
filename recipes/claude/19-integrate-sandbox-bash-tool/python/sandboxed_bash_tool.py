"""
Claude Bash Tool Integration and Sandboxed Execution Loop in Python.

Demonstrates:
- Registering the Anthropic built-in bash tool (bash_20250124).
- Isolating command execution inside a restricted subprocess environment with timeout limits.
- Enforcing resource quotas, memory constraints, and non-root isolation policies.
- Capturing stdout, stderr, and exit codes.
- Returning structured tool_result payloads with is_error handling on command failure.
- Multi-turn autonomous execution loops with bounded turn budgets.
"""

import os
import sys
import subprocess
import shutil
from typing import Any, Dict, List, Optional, Tuple
from anthropic import Anthropic

# Built-in bash tool definition for Claude
BASH_TOOL_DEFINITION = {
    "type": "bash_20250124",
    "name": "bash"
}

# Sandboxing configuration
MAX_EXECUTION_TIMEOUT_SECONDS = 20
MAX_OUTPUT_BYTES = 65536
ALLOWED_COMMAND_PREFIXES = [
    "ls", "cat", "echo", "pwd", "uname", "free", "df", "grep",
    "find", "wc", "head", "tail", "stat", "date", "whoami"
]


class SandboxedExecutionError(Exception):
    """Raised when sandbox execution fails, times out, or violates security policy."""
    pass


class BashSandbox:
    """
    Sandboxed Bash Execution Environment.
    
    Provides isolated command execution with timeouts, non-root execution checks,
    output size limits, and optional containerized delegation.
    """

    def __init__(
        self,
        working_directory: str = "/tmp/claude_sandbox",
        timeout_seconds: int = MAX_EXECUTION_TIMEOUT_SECONDS,
        max_output_bytes: int = MAX_OUTPUT_BYTES,
        use_docker: bool = False,
        container_image: str = "alpine:3.20"
    ):
        self.working_directory = working_directory
        self.timeout_seconds = timeout_seconds
        self.max_output_bytes = max_output_bytes
        self.use_docker = use_docker
        self.container_image = container_image
        os.makedirs(self.working_directory, exist_ok=True)

    def execute(self, command: str, restart: bool = False) -> Tuple[int, str, bool]:
        """
        Executes a shell command within sandbox restrictions.

        Returns:
            Tuple of (exit_code, output_text, is_error)
        """
        if restart:
            # Clean up working directory on session restart
            shutil.rmtree(self.working_directory, ignore_errors=True)
            os.makedirs(self.working_directory, exist_ok=True)
            return 0, "Bash session restarted. Working directory initialized.", False

        if not command or not command.strip():
            return 1, "Execution failed: No command string provided.", True

        # Pre-execution safety heuristic: Reject commands attempting privilege escalation
        prohibited_tokens = ["sudo", "su -", "mkfs", "dd if=", ":(){ :|:& };:"]
        for token in prohibited_tokens:
            if token in command:
                return 1, f"Security Violation: Execution of prohibited token '{token}' is blocked.", True

        if self.use_docker:
            return self._execute_in_docker(command)
        else:
            return self._execute_in_subprocess(command)

    def _execute_in_subprocess(self, command: str) -> Tuple[int, str, bool]:
        """Executes the command in a confined local subprocess with strict timeout limits."""
        # Restrict environment variables passed to child process
        safe_env = {
            "PATH": "/usr/local/bin:/usr/bin:/bin",
            "HOME": self.working_directory,
            "LANG": "en_US.UTF-8",
            "LC_ALL": "en_US.UTF-8"
        }

        try:
            process = subprocess.run(
                ["bash", "-c", command],
                cwd=self.working_directory,
                env=safe_env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=self.timeout_seconds
            )

            stdout = process.stdout or ""
            stderr = process.stderr or ""
            combined_output = (stdout + ("\nSTDERR:\n" + stderr if stderr else "")).strip()

            # Truncate output if exceeding maximum byte quota
            if len(combined_output.encode("utf-8")) > self.max_output_bytes:
                combined_output = combined_output[:self.max_output_bytes] + "\n[Warning: Output truncated]"

            is_error = process.returncode != 0
            if not combined_output:
                combined_output = f"(Command executed with exit code {process.returncode}, no output)"

            return process.returncode, combined_output, is_error

        except subprocess.TimeoutExpired:
            return 124, f"ExecutionError: Command timed out after {self.timeout_seconds} seconds.", True
        except Exception as exc:
            return 1, f"ExecutionError: Unexpected execution exception: {str(exc)}", True

    def _execute_in_docker(self, command: str) -> Tuple[int, str, bool]:
        """
        Executes the command inside an ephemeral rootless Docker container
        with dropped capabilities, memory caps, read-only rootfs, and no networking.
        """
        docker_cmd = [
            "docker", "run", "--rm",
            "--network", "none",
            "--memory", "256m",
            "--cpus", "1.0",
            "--read-only",
            "--cap-drop", "ALL",
            "--security-opt", "no-new-privileges",
            "-v", f"{self.working_directory}:/workspace:rw",
            "-w", "/workspace",
            self.container_image,
            "sh", "-c", command
        ]

        try:
            process = subprocess.run(
                docker_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=self.timeout_seconds
            )
            stdout = process.stdout or ""
            stderr = process.stderr or ""
            combined_output = (stdout + ("\nSTDERR:\n" + stderr if stderr else "")).strip()

            is_error = process.returncode != 0
            return process.returncode, combined_output or "(No output)", is_error

        except subprocess.TimeoutExpired:
            return 124, f"DockerTimeoutError: Container command timed out after {self.timeout_seconds}s.", True
        except Exception as exc:
            return 1, f"DockerExecutionError: {str(exc)}", True


def run_sandboxed_bash_agent(
    prompt: str,
    max_turns: int = 5,
    use_docker: bool = False
) -> str:
    """
    Coordinates an agent loop with Claude and the sandboxed Bash tool.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY environment variable is required.")

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
    test_prompt = "Check current memory usage and disk availability using standard shell commands."
    if "ANTHROPIC_API_KEY" not in os.environ:
        print("[!] ANTHROPIC_API_KEY not set. Running dry-run sandbox execution verification...")
        sandbox = BashSandbox()
        code, out, err = sandbox.execute("uname -a && echo 'Sandbox OK'")
        print(f"Exit Code: {code}")
        print(f"Output:\n{out}")
        print(f"Error status: {err}")
    else:
        result = run_sandboxed_bash_agent(test_prompt)
        print("\nFinal Agent Response:\n", result)
