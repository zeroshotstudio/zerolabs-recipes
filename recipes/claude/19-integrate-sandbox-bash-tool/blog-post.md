# How to Integrate and Sandbox Claude Bash Tool

Claude's built-in Bash tool produces shell commands; the application must provide the execution boundary. Changing a subprocess working directory, filtering command strings, or adding a timeout does not confine host filesystem access. This recipe therefore uses Docker for every command and fails with a tool error when isolation is unavailable.

## The execution boundary

The Python and TypeScript runners execute in a disposable container with a nonzero UID/GID, a read-only root filesystem, dropped capabilities, no-new-privileges, the default Docker seccomp profile, and no network. A 64 MiB writable `/workspace` and 16 MiB `/tmp` are tmpfs mounts. An optional dedicated host input directory is read-only at `/inputs`; no host socket or credential environment is provided.

Each command gets 128 MiB memory with no swap, half a CPU, 64 PIDs, 256 open file descriptors, and a 16 MiB per-file size limit. A 20-second host deadline stops the full named container, and an in-container timeout provides an independent execution limit. Combined output is capped at 64 KiB as bytes arrive. Output overflow stops execution instead of accumulating an unbounded buffer and truncating it afterwards.

Containers share a kernel with their daemon host. These controls do not establish VM isolation or protection against kernel vulnerabilities. Use a patched, preferably rootless daemon on a dedicated host, and choose a VM or microVM if the workload requires a stronger boundary. Daemon access belongs only to the trusted orchestration process.

## Python and TypeScript examples

The maintained implementations are [Python](python/sandboxed_bash_tool.py) and [TypeScript](typescript/src/index.ts). The examples below call those implementations; they do not introduce a second, weaker execution path.

Build the approved image before accepting model commands. The Dockerfile pins the official Bash 5.3.20 base by digest and applies exact OpenSSL/zlib security revisions; it does not copy repository files or credentials into the image:

```bash
docker --host=unix:///var/run/docker.sock build --tag zerolabs-bash-sandbox:1.0.0 .
```

```python
from sandboxed_bash_tool import BashSandbox

runner = BashSandbox()
code, output, is_error = runner.execute(
    "printf 'Hello World\\n' > report.txt && wc -l report.txt && cat report.txt"
)
print(code, output, is_error)
```

```typescript
import { SandboxedBashRunner } from "./src/index";

const runner = new SandboxedBashRunner();
const result = await runner.execute(
  "printf 'Hello World\\n' > report.txt && wc -l report.txt && cat report.txt"
);
console.log(result);
```

Files in `/workspace` disappear after each call. Group operations requiring those files into one command. `restart` returns a reset acknowledgment and never clears a host input directory. To inspect selected host inputs, supply the constructor's `working_directory`/`workingDirectory` option and read them from `/inputs`; only trusted, dedicated input directories should be supplied.

## Returning tool results

The agent loops register `bash_20250124`, retain the assistant's tool-use content, execute its `command` through the sandbox, and return a `tool_result` matching `tool_use_id`. Nonzero exits, timeout, output overflow, or unavailable isolation set `is_error: true`. Tool registration alone does not execute anything on the host.

The [cURL probe](curl_probe.sh) demonstrates the same two-turn exchange. It sends the model's input to the Python executor via JSON on stdin. It does not use `eval`, a host shell fallback, or a fabricated successful exit code.

## Checking the boundary

The runner first creates its container and starts it only after receiving a successful acknowledgment before the deadline. A creation timeout never launches the model command. If a daemon completes that creation later, stopped metadata may require operator removal; the error explicitly reports that uncertainty and the container name.

The [setup and test instructions](README.md) include provider-free regression tests, including a delayed-create daemon stub that proves no model work is started. Live tests verify host-path and symlink probes, read-only inputs, unprivileged execution, disabled networking, actual cgroup resource limits, bounded ephemeral storage, Unicode output caps, and removal of timed-out containers with child processes. Missing Docker support fails safely and leaves the host marker untouched.

The sandbox permits arbitrary Bash syntax inside the stated boundary. It does not claim that a command denylist can secure a host subprocess. Live provider calls and production threat-model validation remain separate from these container tests.
