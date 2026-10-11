# Recipe 19: Integrate and Sandbox Claude Bash Tool

This recipe connects Anthropic's `bash_20250124` tool to a Docker container. Both implementations require Docker and a pre-built trusted image. An unavailable daemon or image returns an error; commands never fall back to a host shell. The cURL probe uses the same Python executor.

## Execution and filesystem contract

Each `command` runs in a fresh container as the invoking user's nonzero UID/GID, or UID/GID 65534 when invoked by root. It gets a read-only root filesystem, no added Linux capabilities, `no-new-privileges`, Docker's default seccomp profile, and no networking. Host credentials and proxy settings are not passed to the command.

The writable `/workspace` is a 64 MiB tmpfs; `/tmp` is a 16 MiB tmpfs. Files disappear when the command finishes. Put dependent shell operations in one command. `restart` acknowledges a reset and never deletes host files. This example provides filesystem isolation per command, not a persistent shell session.

An optional `working_directory` (Python) or `workingDirectory` (TypeScript) exposes a **dedicated, existing host input directory read-only at `/inputs`**. Commands still run in `/workspace`. Give the container UID read access to that input directory, and include only files the model may read. Do not provide a host root, home directory, Docker socket, credentials, or a directory managed by hostile concurrent writers. Symlinks are interpreted inside the container and do not expose additional host mounts.

Limits are 128 MiB memory with no swap, 0.5 CPU, 64 PIDs, 256 file descriptors, 16 MiB per file, a default 20-second wall deadline, and 64 KiB combined stdout/stderr. The host drains and caps output **while it arrives**. Exceeding the output limit stops execution and returns an error. Timeout/output cleanup removes the named container and its descendants; a second in-container timeout limits execution even if the host loses daemon access. The runner creates the container first and starts it only after creation is acknowledged within the deadline. A late, unacknowledged creation cannot execute model work. A timed-out/failed create can leave stopped metadata on an inaccessible or delayed daemon; its cleanup is explicitly reported as unconfirmed with the name to inspect. Cleanup failures after execution are also reported with the container name for operator recovery. Docker logging is disabled for these commands.

No command allowlist or blacklist is claimed: arbitrary shell syntax runs within this boundary. Containers share the daemon host's kernel. Run a patched Docker daemon, preferably rootless on a dedicated host; use a VM or microVM boundary when your threat model requires protection against kernel exploits. The Docker socket stays outside the container. The trusted runner's daemon access remains privileged.

## Setup

Install Docker with working cgroup v2 memory/CPU/PID limits. Each command verifies its nonzero UID, actual cgroup limits, and loopback-only network interfaces before executing model text; unsupported/unenforced limits fail with exit 126. The default endpoint is the local Unix socket `/var/run/docker.sock`; set `docker_socket`/`dockerSocket` in the constructor for a rootless daemon. The runner deliberately ignores remote Docker endpoint selection. It does not pull images during model execution.

```bash
docker --host=unix:///var/run/docker.sock build --tag zerolabs-bash-sandbox:1.0.0 .
```

The recipe Dockerfile pins the official Bash 5.3.20 base by digest and installs exact Alpine security revisions for OpenSSL and zlib. Build it from this recipe directory before use. For a managed proxy, add `--secret id=proxy_ca,src="$CODEX_PROXY_CERT"` to the build; that certificate is mounted only during package installation. Keep the digest/package revisions updated and scan the final image before release. A custom approved image must include `bash`, `timeout`, and the preflight utilities. The host runner and input directory are trusted configuration.

Without a provider key, the entry points run a local isolation check. To use the agent loop, set `ANTHROPIC_API_KEY` and optionally `ANTHROPIC_MODEL` to a model available in your account. `.env.example` documents those variables; entry points do not automatically load `.env`.

```bash
cd python
pip install -r requirements.txt
python sandboxed_bash_tool.py
```

```bash
cd typescript
npm ci
npm run build
npm start
```

From the recipe directory, `./curl_probe.sh` makes two real API requests and executes the requested command through the Python sandbox. It requires Docker, Python, cURL, jq, and an Anthropic key. It never evaluates model output on the host.

## Verification

Offline tests check disabled host fallback, missing-daemon behavior, configuration validation, and safe restart. Live tests additionally probe external host paths, symlinks, read-only inputs/root, networking, actual cgroup limits, ephemeral bounded storage, byte limits, and descendant/container cleanup.

```bash
python -m unittest discover -s python -p 'test_*.py'
(cd typescript && npm test)
RUN_SANDBOX_DOCKER_TESTS=1 python -m unittest discover -s python -p 'test_*.py'
(cd typescript && RUN_SANDBOX_DOCKER_TESTS=1 npm test)
```

These tests use no model credentials. The Docker tests require the approved image already built and a Linux cgroup v2 daemon that enforces the stated limits. Commands observe container resources, not host telemetry. Container results are returned as `tool_result` blocks with `is_error` set on nonzero exits, deadlines, output limits, or sandbox failures.
