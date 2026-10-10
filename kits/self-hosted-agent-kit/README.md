# ZeroLabs Agent Kit 2.0

A self-hosted task workspace for a single technical operator. Run a bounded AI assistant, follow its actual execution, and keep its results and documents in your own PostgreSQL database.

The kit supplies an application, a real background worker, deployment files, a local MCP bridge, verified backups, and a recovery procedure. You supply a Linux host, Docker, and (for AI tasks) an OpenAI API key and a model supporting the Responses API and function calling. Model calls leave your server and are billed separately by the provider.

## What works

- Durable tasks with queued / running / completed / failed / cancelled states. Completion requires a saved result.
- A worker that calls the OpenAI Responses API and executes four bounded tools: list documents, read a document, calculate, and save a text artifact.
- A genuine local system check that needs no model key.
- Task history, execution traces, provider-reported token usage, cancellation, manual retries, artifact downloads, search and filters.
- Operator sessions, CSRF protection, revocable API tokens with explicit permissions, and an access audit trail.
- A responsive, keyboard-accessible dashboard inspired by Linear's hierarchy, spacing and restrained visual design. No affiliation with Linear.
- Private networking by default; optional public HTTPS or private Tailscale Serve.
- Atomic PostgreSQL backups with checksums, optional verified rclone copies, a daily systemd timer, and a clean-workspace restore command.
- An MCP stdio bridge and a dependency-free Python task client.

This is a single-host, single-workspace product. It is **not** a general autonomous server administrator, OpenClaw runtime, multi-tenant platform, local model bundle, high-availability cluster, or guarantee of correct AI output. The assistant cannot execute shell commands, browse the web, send messages, access arbitrary files, or deploy software. Documents are context, not a vector search/RAG service. You can build external clients against the task API.

## Start

Target: Ubuntu 22.04/24.04 or Debian 12 with Docker Engine and Docker Compose **2.24.4+**, Python 3, Bash, `flock`, 2 CPU cores, 2 GiB RAM minimum (4 GiB recommended), and 10 GiB free disk plus your backup storage. The included containers support amd64 and arm64 through their upstream images; the release acceptance run records the architecture actually tested.

1. Verify the release's `SHA256SUMS` and extract the ZIP. Review the included license and release notes.
2. Install Docker using its [official instructions](https://docs.docker.com/engine/install/).
3. From the extracted kit, run `sudo ./scripts/setup.sh`. It installs to `/opt/agentkit`, generates private credentials, builds and starts the stack, and enables a daily backup timer on systemd hosts.
4. For a remote host, open an SSH tunnel: `ssh -L 3080:127.0.0.1:3080 your-server`. Open **http://localhost:3080** and sign in using `ADMIN_TOKEN` from `/opt/agentkit/.env`.
5. Run **System check**. To enable AI tasks, set `OPENAI_API_KEY` and `OPENAI_MODEL` in `.env`, then run `docker compose up -d --force-recreate worker` in `/opt/agentkit`.
6. Run `sudo ./scripts/backup.sh`. Save `.env` separately in an encrypted password vault and rehearse a restore into another installation.

`setup.sh --dest /path` also works from inside that same directory; existing `.env` and runtime data are preserved. `--no-start --no-timer` prepares files without starting services. A pre-existing `.env` must have valid v2 credentials; setup will not silently overwrite it. The installer never changes your firewall or SSH port.

## Documentation and integrations

Open `/docs` on the running app, or [docs/index.html](docs/index.html) offline. See [Quickstart](docs/QUICKSTART.md), [Developer guide](docs/DEVELOPER-GUIDE.md), [Recovery and security](docs/HARDENING-CHECKLIST.md), [Support](docs/SUPPORT-GUIDE.md), and [Release acceptance](docs/RELEASE-ACCEPTANCE.md).

For MCP, run `npm ci` in `integrations/mcp`, create a token in **Connections**, and adapt [the client configuration](templates/claude_desktop_config.json). This is a local Node program shipped with the kit; no unpublished registry package is required. OpenClaw can be integrated as an external API client where supported by your configuration, but this release does not execute OpenClaw agent sessions.

## Development and verification

```sh
npm ci --prefix app
npm test --prefix app
npm ci --prefix integrations/mcp
# On a dedicated test installation with a project name containing "test":
docker compose -f docker-compose.yml -f tests/compose.test.yml up -d --build --wait
node tests/acceptance.mjs
```

The test override uses a deterministic local provider fixture. It is never included in the production service configuration. The acceptance record distinguishes protocol tests from a paid live-model test. Run `python3 scripts/release.py` to create a versioned ZIP, a code digest, and SHA-256 checksums. The packager includes dotfiles and executable modes and excludes secrets, dependency folders and runtime data.

## Moving from 1.x

Use a **separate v2 installation**. The previous release used simulated dispatch records, different credentials and a Redis service. Do not run v2 setup over a running v1 directory or attach v1 volumes to v2 without an explicit migration plan. Export and retain the old installation and data as historical records. If an administrator imports the old `agent_tasks` table into v2 PostgreSQL before running migrations, rows are labelled **archived / unverified**, never completed work. Existing public 1.x releases are not automatically secured by installing this code elsewhere.

The kit's [commercial license](LICENSE) covers this directory. Third-party software retains its own licenses; see [THIRD-PARTY-NOTICES](THIRD-PARTY-NOTICES.md). Hosting, model charges, provider accounts, offsite storage, domain registration, and ongoing administration are separate.
