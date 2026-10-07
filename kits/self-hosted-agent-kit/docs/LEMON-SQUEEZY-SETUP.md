# Lemon Squeezy Product Setup & Launch Runbook

This runbook details the exact steps to launch the **Self-Hosted Agent Infrastructure Kit** on Lemon Squeezy and integrate it into ZeroLabs to generate €250+/month.

---

## 1. Product Setup in Lemon Squeezy

Log in to [Lemon Squeezy](https://app.lemonsqueezy.com/products):

### A. Core Product Details
- **Product Name:** `The Self-Hosted Agent Infrastructure Kit`
- **Tax Category:** `Software / Digital Goods`
- **Price:** `€35.00 EUR` (Single-payment / Lifetime)
- **Description:**
  > Turnkey, production-hardened infrastructure templates to self-host autonomous AI agents (OpenClaw, Claude Code, Cursor, custom agents) on an Ubuntu VPS in under 15 minutes.
  >
  > **What you get:**
  > - Multi-container Docker Compose stack (Node/Python runtime, Postgres 16, Redis 7, Caddy 2)
  > - Caddyfile reverse proxy with automatic HTTPS and streaming SSE proxy support
  > - systemd supervision unit files for reboot persistence
  > - Python watchdog monitor with real-time Telegram incident alerts
  > - Automated zero-downtime daily backup script with retention pruning
  > - Model Context Protocol (MCP) bridge config for Postgres & filesystem tools
  > - 15-Minute Zero-to-Production Quickstart Guide & Hardening Checklist
  > - Commercial Single-Operator License

### B. Fulfillment File
- Upload the distributable archive: `self-hosted-agent-kit.zip`
- Or direct redirect to private GitHub repository invite / download URL.

### C. Upsell Tier / Variant: Concierge Deployment (€350)
- Add a product variant or checkout custom field:
  - **Option Name:** *Concierge Deployment by Jimmy Goode*
  - **Price:** `€350.00 EUR`
  - **Description:** *Jimmy will personally provision your VPS, configure DNS & SSL certificates, deploy the hardened stack, set up Telegram alerts, and verify agent execution.*

---

## 2. ZeroLabs Article Callout Widgets

To capture high-intent organic search traffic from developers reading our VPS and agent guides, add this callout block directly above the first H2 heading or at the conclusion of the guide:

### Callout Block Markdown:
```markdown
> **Production Starter Kit:** Skip the trial-and-error of configuring Docker Compose, Caddy SSE streaming proxies, and systemd watchdogs. Download the turnkey **[Self-Hosted Agent Infrastructure Kit](CHECKOUT_URL)** (€35) — production-hardened, multi-agent ready, with automated Telegram alerting. Need it done for you? [Book Jimmy for turnkey deployment](https://jimmygoode.com).
```

---

## 3. Top 3 Target Articles on ZeroLabs

1. **[Self-Host Headless Agents on an Ubuntu VPS](https://labs.zeroshot.studio/agents/self-hosting-headless-agent-vps)**
   - *Placement:* Immediately after the Architecture diagram and before the Xvfb section.
2. **[Secrets, API Keys, and Rate Limits on Day One](https://labs.zeroshot.studio/ai-workflows/secrets-api-keys-and-rate-limits)**
   - *Placement:* Right before the Twelve-Factor secret isolation blueprint.
3. **[Zero-Public-Port Production Behind Tailscale](https://labs.zeroshot.studio/vps-infra/zero-public-port-production-tailscale)**
   - *Placement:* Inside the production architecture section.

---

## 4. Revenue Math to Hit €250/mo AI Infrastructure Target

- **Option A (Pure Kit Sales):** 8 sales @ €35 = **€280/mo**
- **Option B (1 Deployment Client):** 1 concierge setup @ €350 = **€350/mo** (Goal exceeded with a single client)
- **Option C (Mixed):** 4 sales (€140) + VPS referrals (€110) = **€250/mo**
