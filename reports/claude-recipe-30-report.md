# Verification and Execution Report: Claude Platform Curriculum Recipe 30

**Module:** Module 10: Batch Processing, Guardrails & Production Governance  
**Recipe:** Recipe 30: Track Usage Costs and Audit Admin API Events  
**Slug:** `how-to-track-usage-costs-and-audit-admin-api-events`  
**Live URL:** https://labs.zeroshot.studio/resources/how-to-track-usage-costs-and-audit-admin-api-events  
**Git Repository:** https://github.com/zeroshotstudio/zerolabs-recipes/tree/main/recipes/claude/30-track-usage-costs-admin-api  
**Execution Timestamp:** 2026-09-17T13:09:00Z  

---

## 1. Executive Summary

Recipe 30 delivers an enterprise-grade cost tracking and organization audit engine for Anthropic Claude applications. As the 30th and concluding recipe in the Claude Platform Curriculum, it establishes production-grade financial attribution and security governance across multi-tenant workspaces.

The reference implementation demonstrates:
- **Granular Token Cost Attribution:** Precise calculation across standard input, generated output, prompt cache writes ($3.75/M on Sonnet), and prompt cache reads ($0.30/M on Sonnet).
- **Multi-Tier Model Pricing:** Full matrix support for Claude 3.7 Sonnet, Claude 3.5 Sonnet, Claude 3.5 Haiku, and Claude 3 Opus.
- **Anthropic Admin API Integration:** Programmatic polling of Organization Admin endpoints (`/v1/organizations/workspaces` and `/v1/organizations/audit_logs`).
- **Prometheus Telemetry:** Exposing `anthropic_tokens_total`, `anthropic_estimated_cost_dollars`, `anthropic_cache_read_ratio`, and `anthropic_audit_events_total` for Grafana dashboards.
- **Governance Anomaly Detection:** Real-time flagging of off-hours key provisioning, key revocations, and workspace access modifications.

---

## 2. Monorepo Companion Assets

Created in `recipes/claude/30-track-usage-costs-admin-api/`:
- `README.md`: Architecture overview, pricing table, and setup instructions.
- `.env.example`: Admin API and Prometheus port configurations.
- `metadata.json`: Verified metadata schema with slug, zone, tags, and 132-character excerpt.
- `blog-post.md`: 1,809 words Diátaxis how-to guide adhering to ZeroLabs writing persona.
- `test_probe.sh`: Sub-5-second automated probe testing calculation math, TypeScript syntax, and secret leaks.
- `python/cost_tracker.py`: Production Python cost calculation engine and Prometheus server.
- `typescript/src/cost_tracker.ts`: Production TypeScript cost engine and `prom-client` exporter.
- `typescript/package.json` & `typescript/tsconfig.json`: TypeScript configuration.

---

## 3. Pre-Flight Link & Quality Verification

All internal and external links verified live (HTTP 200 OK):
- `https://github.com/zeroshotstudio/zerolabs-recipes/tree/main/recipes/claude/30-track-usage-costs-admin-api`: HTTP 200
- `https://labs.zeroshot.studio/resources/how-to-configure-prompt-caching-breakpoints`: HTTP 200
- `https://labs.zeroshot.studio/resources/how-to-optimize-token-costs-with-1-hour-ephemeral-cache`: HTTP 200
- `https://labs.zeroshot.studio/resources/how-to-execute-asynchronous-batch-processing-with-claude-api`: HTTP 200

Style and Quality Gate Results (`validate_content.py`):
- **Word Count:** 1,809 words (Target: 1,800 - 2,400 words).
- **Excerpt Length:** 132 characters (Target: 120 - 155 characters).
- **Headings:** Zero `# ` H1 headings in body. First level subsections start at `##`.
- **Persona:** First-person plural ("we", "our team"). Zero em-dashes (`—` or `--`). Zero banned marketing filler.
- **Secret Scan:** Pre-commit scan verified clean.

---

## 4. Publishing Status

- **ZeroLabs DB Post ID:** 389
- **Status:** `published`
- **Review Status:** `reviewed`
- **Zone:** `resources`
- **Live HTTP Code:** 200 OK
