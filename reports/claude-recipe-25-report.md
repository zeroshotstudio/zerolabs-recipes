# Verification Report: Claude Platform Curriculum Module 9, Post 1 (Recipe 25)

## Executive Summary
- **Module:** Module 9 (MCP Client Wiring & Multi-Server Orchestration)
- **Post:** Post 1 (Recipe 25)
- **Title:** Connect Claude Desktop and Cursor to Custom MCP
- **Slug:** `how-to-connect-claude-desktop-and-cursor-to-custom-mcp-servers`
- **Zone:** `resources`
- **Tags:** `claude`, `anthropic`, `mcp`, `cursor`, `claude-desktop`, `developer-guides`, `claude-module-9`
- **Excerpt:** Connect Claude Desktop and Cursor to custom MCP servers via local stdio configurations, environment injection, and connection diagnostics. (138 chars)
- **Status:** Published & Verified Live (HTTP 200 OK)
- **Live URL:** https://labs.zeroshot.studio/resources/how-to-connect-claude-desktop-and-cursor-to-custom-mcp-servers
- **Commit Hash:** `8be5d0f8d3b50c29e7a66ab3c254cdc95a870678`
- **Monorepo Directory:** `recipes/claude/25-connect-desktop-cursor-mcp`
- **GitHub Monorepo URL:** https://github.com/zeroshotstudio/zerolabs-recipes/tree/main/recipes/claude/25-connect-desktop-cursor-mcp

---

## Artifacts Created & Validated

| File | Purpose | Validation |
| :--- | :--- | :--- |
| `metadata.json` | SEO & platform schema attributes | Valid JSON, excerpt 138 chars |
| `.env.example` | Environment configuration reference | Cleaned, zero secrets |
| `README.md` | Monorepo package documentation | Fully documented |
| `configs/claude_desktop_config.json` | Sample Claude Desktop configuration | Valid JSON |
| `configs/cursor_mcp.json` | Sample Cursor IDE configuration | Valid JSON |
| `python/server.py` | Companion FastMCP server | Validated stdio JSON-RPC handshake |
| `typescript/package.json` | TypeScript dependencies & build scripts | Installed & compiled with tsc |
| `typescript/tsconfig.json` | NodeNext TS compiler options | Valid |
| `typescript/src/server.ts` | Companion TypeScript MCP server | Validated stdio JSON-RPC handshake |
| `typescript/dist/server.js` | Compiled JS bundle | Verified runnable under node |
| `verify_configs.sh` | Sub-5s executable validation probe | Exit code 0, elapsed < 2s |
| `blog-post.md` | Diátaxis How-To article (3,330 words) | Full ZeroLabs persona compliance |

---

## Pre-Flight Link & Persona Verification

All embedded links were pre-flight tested and verified returning HTTP 200:
- `https://github.com/zeroshotstudio/zerolabs-recipes/tree/main/recipes/claude/25-connect-desktop-cursor-mcp` (HTTP 200 OK)
- `https://labs.zeroshot.studio/resources/how-to-build-an-mcp-server-with-python-sdk` (HTTP 200 OK)
- `https://labs.zeroshot.studio/resources/how-to-build-an-mcp-server-with-typescript-sdk` (HTTP 200 OK)
- `https://labs.zeroshot.studio/resources/how-to-configure-stdio-and-sse-mcp-transports` (HTTP 200 OK)
- `https://modelcontextprotocol.io` (HTTP 200 OK)

Editorial and Persona Rules:
- First-person plural ("we", "our team") used consistently.
- Zero em-dashes (`—`) in prose.
- Zero H1 (`# `) tags in markdown body (subsections start at `##`).
- Zero secret credentials or private internal paths leaked.
- Excerpt is strictly 138 characters (within 120-155 limits).

---

## Live Endpoint Verification

```bash
$ curl -sI https://labs.zeroshot.studio/resources/how-to-connect-claude-desktop-and-cursor-to-custom-mcp-servers | head -n 5
HTTP/1.1 200 OK
Server: nginx
Content-Type: text/html; charset=utf-8
```
