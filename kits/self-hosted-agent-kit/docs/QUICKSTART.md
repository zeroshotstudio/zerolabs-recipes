# Quickstart

Follow the six steps in [the root README](../README.md). No checkout, license activation server, tailnet membership or pre-seeded demo data is required to run the downloaded code. Purchase and distribution belong to the storefront, outside the operations application.

## Configuration

Credentials are generated only for a new `.env`, which is mode `0600`. Existing configuration is validated and preserved. Read the operator key on your host with your editor; do not paste it into shared logs or screenshots. The browser exchanges it for an HttpOnly session cookie; it is not stored in browser localStorage.

Choose a model that supports the OpenAI **Responses API**, function calling and `max_output_tokens`. Set `OPENAI_API_KEY` and `OPENAI_MODEL`, and recreate the worker. A configured key does not prove provider access: run `./scripts/provider-smoke.sh` for a small billable calculation-and-artifact test. It verifies the actual worker, model, tool calls and saved output. Set provider-side project budgets and alerts; the kit's time, call and output limits are not a currency budget.

## Private access

Default Caddy binding: `127.0.0.1:3080`; PostgreSQL and the API have no published ports. On your own machine open `http://localhost:3080`. For a server use `ssh -L 3080:127.0.0.1:3080 your-server`.

For Tailscale, install and authenticate its client on the host, then run `sudo ./scripts/tailscale-setup.sh`. It reads the host's actual DNS name, sets `PUBLIC_ORIGIN`, restarts the API, and enables persistent **Serve** to port 3080. It does not enable Funnel. This requires Tailscale HTTPS to be enabled for your tailnet. Operator login remains required. Tailscale provisioning requires your own account and is verified separately on your network.

## Public HTTPS

Point your domain's A/AAAA records to the host. Set `ENABLE_PUBLIC=true`, `PUBLIC_DOMAIN=agents.example.com`, `ACME_EMAIL=you@example.com` and `PUBLIC_ORIGIN=https://agents.example.com` in `.env`. Open TCP 80 and 443 in the host/cloud firewall. Then run:

```sh
docker compose -f docker-compose.yml -f compose.public.yml up -d --force-recreate caddy api
```

The helper scripts include the public override whenever `ENABLE_PUBLIC=true`. **Raw docker compose commands do not read ENABLE_PUBLIC**; use both `-f` files for subsequent public-mode operations. The public override replaces the loopback port mapping. Its Caddy health probe stays on an internal HTTP port, so it does not follow a redirect to an IP address with an invalid TLS certificate.

Do not bind port 3000, publish PostgreSQL, or use a remote HTTP `PUBLIC_ORIGIN`. The application rejects insecure remote origins. The installer does not change firewall rules, so custom SSH ports remain your responsibility.

## Daily operations

`./scripts/status.sh` checks readiness and exits nonzero if the worker or database is unavailable. `docker compose logs --tail 100 api worker` shows bounded service logs. Docker restarts crashed processes; health checks alone do not restart a stuck process. Monitor `/health/ready` with your preferred external uptime service and monitor disk capacity. Use `./scripts/backup.sh` and check `systemctl list-timers agentkit-backup.timer`.

If setup used `--no-timer`, or the host does not run systemd, schedule the backup yourself. Every backup includes a checksum-verified database dump. Credentials are intentionally not embedded in archives; keep `.env` in a separate encrypted password vault.
