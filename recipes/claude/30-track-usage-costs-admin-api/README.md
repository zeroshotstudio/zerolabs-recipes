# Track Usage Costs and Audit Admin API Events

Production recipe for tracking Claude API token usage costs, parsing Anthropic Admin API organization audit events, and exporting Prometheus telemetry for multi-tenant AI applications.

## Overview

Operating LLM workflows in production requires granular cost tracking and strict organization governance. This recipe implements:

- **Token cost attribution:** Real-time billing calculation across standard input, generated output, prompt cache writes ($3.75/M on Sonnet), and prompt cache reads ($0.30/M on Sonnet).
- **Pricing matrix support:** Pre-configured pricing tiers for Claude 3.7 Sonnet, Claude 3.5 Sonnet, Claude 3.5 Haiku, and Claude 3 Opus.
- **Admin API integration:** Programmatic polling of Anthropic Organization Admin endpoints (`/v1/organizations/workspaces` and `/v1/organizations/audit_logs`).
- **Prometheus telemetry exporter:** Exporting `anthropic_tokens_total`, `anthropic_estimated_cost_dollars`, `anthropic_cache_read_ratio`, and `anthropic_audit_events_total` metrics for Grafana dashboards.
- **Security anomaly detection:** Flagging sensitive actions (such as off-hours API key generation or unexpected workspace member modifications).

## Directory Structure

```text
30-track-usage-costs-admin-api/
├── README.md
├── metadata.json
├── .env.example
├── test_probe.sh
├── python/
│   ├── cost_tracker.py
│   └── requirements.txt
└── typescript/
    ├── package.json
    ├── tsconfig.json
    └── src/
        └── cost_tracker.ts
```

## Quickstart

### Python

1. Install dependencies:
   ```bash
   pip install -r python/requirements.txt
   ```
2. Configure credentials:
   ```bash
   cp .env.example .env
   # Set ANTHROPIC_ADMIN_API_KEY and ANTHROPIC_API_KEY
   ```
3. Run the cost calculation test:
   ```bash
   python3 python/cost_tracker.py
   ```

### TypeScript

1. Install dependencies:
   ```bash
   cd typescript && npm install
   ```
2. Build and run:
   ```bash
   npm run build
   node dist/cost_tracker.js
   ```

## Automated Verification

Run the sub-5-second automated probe:
```bash
./test_probe.sh
```
