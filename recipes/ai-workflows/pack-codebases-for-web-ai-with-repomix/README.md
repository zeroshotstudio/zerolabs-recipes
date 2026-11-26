# Pack Codebases for Web-Only AI with Repomix

Companion files for [Pack Codebases for Web-Only AI with Repomix](https://labs.zeroshot.studio/ai-workflows/pack-codebases-for-web-ai-with-repomix).

## Included Files

- `repomix.config.json`: Drop-in configuration with Secretlint enabled, line numbers on, base64 truncation enabled, and common lockfile/vendor/build exclusions.
- `SKILL.md`: Portable agent skill manifest for auditing token distribution and packing context bundles safely.
- `web-ai-prompt.md`: Structured review and diff prompt template to paste alongside your packed XML bundle in any web-only AI UI (such as Google Search AI Mode, ChatGPT Web, or Claude Web).

## Quick Start

```bash
# 1. Audit token distribution before packing
npx --yes repomix --no-files --token-count-tree 5000

# 2. Pack with the companion config
npx --yes repomix -c repomix.config.json --token-budget 150000
```
