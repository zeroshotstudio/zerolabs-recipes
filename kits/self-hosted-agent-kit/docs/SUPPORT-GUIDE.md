# Support and troubleshooting

For purchase, download delivery and product support enquiries, contact
[hello@jimmygoode.com](mailto:hello@jimmygoode.com).

Collect: kit version, host OS/architecture, Docker/Compose versions, failing operation, timestamp, request ID, task ID, `scripts/status.sh` output, and relevant API/worker/backup log excerpts. Redact prompts, document content, tokens, passwords and provider keys. Never upload `.env` or a database backup to a public issue.

| Symptom | Action |
| --- | --- |
| Cannot connect remotely | Default access is loopback only. Open the SSH tunnel, use Tailscale Serve, or configure the documented public HTTPS override. |
| Login says origin mismatch | Match PUBLIC_ORIGIN exactly to the URL in the browser, including scheme and port; recreate the API after editing it. |
| AI option disabled | Set OPENAI_API_KEY and OPENAI_MODEL, recreate the worker, and confirm its current heartbeat. System checks work without a model. |
| Task queued | Check the worker with scripts/status.sh and Docker logs. Accepted jobs remain in PostgreSQL. |
| Provider HTTP error | Check provider credentials, model capability/access and account limits. The task fails visibly; review before retrying. |
| Task interrupted | A worker lease expired or execution stopped. Read the trace and any partial artifacts; only a manual retry starts another task. |
| Backup unknown/stale/failed | Check the systemd timer and journal, free disk, PostgreSQL health, and rclone access. A configured timer is not proof of a successful backup. |
| Restore refused | Use a separate clean workspace with the same kit version. Never delete production volumes to make room for a rehearsal. |
| Container healthy but readiness fails | Liveness and readiness differ. /health/ready also requires PostgreSQL and an actual recent worker heartbeat. |
| MCP connection fails | Run npm ci in integrations/mcp; check Node version, absolute script path, HTTPS/loopback URL, token permissions and token revocation. |

Support should cover reproducible defects in the shipped installer, app, scripts, and documented integration contract. Hosting administration, model quality, third-party outages, custom tools, runtime extensions and migration of arbitrary existing data require separate work. Publish response expectations and the applicable refund/withdrawal terms on the storefront before accepting payment. This scope description does not restrict mandatory consumer rights or remedies.
