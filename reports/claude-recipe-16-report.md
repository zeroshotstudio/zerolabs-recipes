# Verification Report: Claude Curriculum Module 6, Post 1

## Executive Summary

- **Title:** How to Define and Register Tools with Claude
- **Slug:** `how-to-define-and-register-tools-with-claude`
- **Live URL:** [https://labs.zeroshot.studio/resources/how-to-define-and-register-tools-with-claude](https://labs.zeroshot.studio/resources/how-to-define-and-register-tools-with-claude)
- **HTTP Status:** 200 OK
- **MCP Post ID:** 376
- **Repository Commit:** `0c67f3e` (`origin/main` at `projects/zerolabs-recipes`)
- **Zone:** `resources`
- **Tags:** `["claude", "anthropic", "api", "tool-use", "function-calling", "developer-guides", "claude-module-6"]`

---

## Deliverables & Architecture

1. **Blog Post Article (`blog-post.md`)**:
   - Diátaxis How-To framework with 100% compliance on ZeroLabs quality guard rails.
   - Zero em-dashes (`—`) or double-dashes (`--`), zero marketing clichés, zero banned AI tropes.
   - Question H2 headings, 3-bullet Key Takeaways, Contents anchor list, and 4-question FAQ.
   - Production callout: `> **The hard rule:** Always set tool_choice: {"type": "tool", "name": "..."} for single-purpose extraction pipelines where text-only responses represent system errors. Reserve auto for multi-step agentic assistants capable of conversational fallback.`
   - Mermaid sequence flowchart (`flowchart LR`) illustrating the tool registration, evaluation, payload generation, and invocation dispatch lifecycle.
   - 4-row architectural comparison table evaluating Autonomous (`auto`), Forced Any (`any`), Forced Specific (`tool`), and Suppressed (`none`) across execution guarantees, block output formats, latency profiles, and ideal architectures.
   - Deterministic code implementations across Python (official Anthropic SDK), TypeScript (`@anthropic-ai/sdk`), and executable cURL Messages API probes.

2. **Monorepo Companion Code**:
   - Path: `projects/zerolabs-recipes/recipes/claude/16-define-and-register-tools/`
   - Files:
     - `README.md`: Architecture overview, directory layout, and quickstart execution.
     - `.env.example`: Environment variable template for Anthropic API credentials.
     - `curl_probe.sh`: Executable bash probe testing `auto` and forced `tool` choice modes.
     - `metadata.json`: Article metadata configuration.
     - `python/requirements.txt`: Python package dependencies.
     - `python/define_tools.py`: Tool definitions, typed parameters, and response content block parser.
     - `typescript/package.json`: Node.js manifest.
     - `typescript/tsconfig.json`: TypeScript configuration.
     - `typescript/src/defineTools.ts`: TypeScript tool schemas and response block extraction logic.
     - `blog-post.md`: Complete article source.

3. **Validation & Pre-Flight Checks**:
   - Passed `validate_content.py` with 0 errors.
   - Confirmed all internal resource links return HTTP 200:
     - `/resources/how-to-structure-messages-api-requests-and-roles` (200 OK)
     - `/resources/how-to-handle-stop-reasons-and-max-token-truncation` (200 OK)
     - `/resources/how-to-manage-anthropic-api-keys-and-environment-variables` (200 OK)
     - `/resources/how-to-implement-server-sent-event-streaming-with-claude` (200 OK)
     - `/resources/how-to-configure-prompt-caching-breakpoints` (200 OK)
   - Verified live published URL via `curl -sI` returning HTTP 200 OK.
