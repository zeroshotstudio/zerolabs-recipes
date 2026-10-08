# Security and recovery

## Access and credentials

- Run a private loopback deployment, a private Tailscale Serve deployment, or the public HTTPS override. Do not expose the application over remote HTTP.
- Keep `.env` mode 0600. Keep its values out of tickets, screenshots, shell tracing and git. The release ZIP must not contain `.env`.
- Integrations use separately named tokens with minimum scopes. Revoke them in Connections. Protect client MCP configuration because it contains that client's token.
- To rotate the operator key, generate a new random 32+ character value, update `.env`, clear browser sessions using `docker compose exec -T postgres sh -c 'psql -U agent_admin -d "$POSTGRES_DB" -c "DELETE FROM sessions"'`, and recreate the API. Rotating a value in `.env` alone does not revoke already-issued sessions.
- Database administrator password rotation also requires PostgreSQL `ALTER ROLE`; changing the environment on an existing volume alone does not change the database password. Re-running migrations rotates the application role to the new DB_PASSWORD. Use a planned maintenance window and a verified backup.
- Update pinned image digests and dependency lockfiles deliberately, and rerun acceptance tests. Dependency audits do not establish that the whole product is secure.

## Backups

From the installed directory run `sudo ./scripts/backup.sh`. It takes an exclusive lock, writes a custom-format PostgreSQL dump into a private temporary directory, checks pg_dump's exit code, validates the archive catalogue, calculates a SHA-256 checksum, packages and verifies the archive, and atomically renames it. The final archive contains exactly `database.dump` and `manifest.json`.

The dashboard summary is atomically updated only after verification. A failed attempt is shown as failed even when an older backup exists. Retention (default 14 verified archives, minimum 2) runs only after the new local archive and any configured offsite copy have succeeded. Backups contain sensitive workspace data and credential hashes: local files are mode 0600 under a mode-0700 directory. Local archives are **not encrypted**. Use encrypted disks and a private encrypted offsite destination.

For offsite backup, install/configure rclone as the same account that runs the systemd service (root by default). Prefer an rclone `crypt` remote backed by your storage provider. Set `BACKUP_REMOTE=your-crypt-remote:agentkit` in `.env`. Each upload is read back and SHA-256 checked; this uses download bandwidth. Offsite retention is owned by your storage policy, not automatically pruned by the kit. Keep the crypt keys separately so recovery remains possible.

The generated `.env` is excluded from the archive. Store it, provider recovery information, and rclone crypt configuration in a separate encrypted password vault. A database-only archive cannot recover credentials you have lost.

## Restore rehearsal

1. Obtain the same kit version and a verified archive; recover `.env` separately.
2. Install in a **separate** directory/project/host. For same-host rehearsals use a different `COMPOSE_PROJECT_NAME`, `PORT` and loopback `PUBLIC_ORIGIN`; use `setup.sh --no-start --no-timer` to avoid replacing the production backup timer.
3. Build the image with `docker compose build api`; run `./scripts/restore.sh /absolute/path/agentkit-TIMESTAMP.tar.gz`.
4. The script rejects unexpected archive members, version mismatches and checksum failures before database work. It refuses a destination containing tasks, documents or tokens. pg_restore runs in one transaction with exit-on-error. Schema permissions are reapplied.
5. Sessions, API tokens and worker registrations are cleared. Queued/running tasks become failed with an interruption explanation; they are not replayed. Sign in with the recovered or newly generated operator key, confirm known documents/results/artifacts, create fresh integration tokens, and run a system check.
6. Record the restore date, archive, verified content and time to recovery outside the database being tested. Repeat after significant upgrades.

The backup process validates an archive; only a rehearsal proves recovery for your host and storage setup. The product does not promise zero data loss or a fixed recovery time. Daily backups imply up to roughly a day of lost changes, subject to successful schedule execution.

## Upgrade and rollback

Extract and verify a new release separately. Read its migration notes. Run `./scripts/update.sh /path/to/new/extracted/kit` from the old v2 installation; it takes a verified backup before copying package files and preserves `.env`. If anything fails, inspect service state and logs; do not repeatedly rerun migrations without understanding the failure. Keep the old release and the pre-upgrade archive. A schema rollback uses a clean installation of the matching old version plus its matching archive, not merely an old Docker image. v1→v2 is a separate-install migration; it is not supported as an in-place update.

## Capacity and availability

This is a single host. Monitor free disk, `/health/ready`, and timer failures externally. Application container logs rotate at 3 × 10 MiB per service; PostgreSQL data and task history grow until you deliberately prune them. Backups cover data, not a bootable host image. No availability SLA, autonomous incident remediation, host patch management, secrets manager or SOC2 certification is included.
