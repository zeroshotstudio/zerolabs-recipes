# 🧪 ZeroLabs Recipes (`zerolabs-recipes`)

> **The Flagship Open-Source Companion Monorepo for [ZeroLabs Intelligence Briefs](https://labs.zeroshot.studio)**

[![CI Status](https://github.com/zeroshotstudio/zerolabs-recipes/actions/workflows/ci.yml/badge.svg)](https://github.com/zeroshotstudio/zerolabs-recipes/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![ZeroLabs](https://img.shields.io/badge/ZeroLabs-Intelligence%20Briefs-blueviolet)](https://labs.zeroshot.studio?utm_source=github&utm_medium=repo&utm_campaign=zerolabs-recipes)
[![Maintained by ZeroShot](https://img.shields.io/badge/Maintained%20by-ZeroShot%20Studio-000000.svg)](https://zeroshot.studio)

Welcome to `zerolabs-recipes`! This repository is designed as the definitive reference implementation companion for all technical teardowns, architectural briefs, and agent playbooks published on [ZeroLabs](https://labs.zeroshot.studio).

Every recipe is standalone, tested via automated CI, and containerized so developers and AI agents can execute, test, and adapt them immediately without dependency friction.

---

## 🧭 The ZeroLabs Exemplar Standard: Modern Git & GitHub

We use this monorepo as a live, open-source exemplar demonstrating how modern engineering teams and autonomous AI agents configure, branch, test, review, and ship production code:

1. **Deterministic Monorepo Layout:** Clean boundaries where every recipe possesses its own dependency manifest, runtime harness, and environment templates.
2. **Community Standards:** Production-grade [Issue Templates](.github/ISSUE_TEMPLATE), [PR Template](.github/pull_request_template.md), and [Contribution Guide](CONTRIBUTING.md).
3. **Automated Verification:** Continuous Integration ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) testing Python syntax validity and Docker Compose declarations on every PR and push.
4. **Canonical Provenance:** Direct bi-directional traceability between every line of companion code and its architectural teardown on [ZeroLabs](https://labs.zeroshot.studio).

---

## 📚 Recipe Catalog

### 🌿 Git & GitHub Mastery Series (Foundational Blueprint)
*The comprehensive guide for modern builders and non-developers navigating version control in the AI era.*

| Recipe | Topic | Architecture & Brief | Stack |
| :--- | :--- | :--- | :--- |
| [`git-mastery/01-github-for-beginners`](./recipes/git-mastery/01-github-for-beginners) | Branches, Commits & PRs Demystified | [Read Deep Dive](https://labs.zeroshot.studio/ai-workflows/github-for-beginners?utm_source=github&utm_medium=repo&utm_campaign=github-for-beginners) | Git CLI, GitHub Flow |
| [`git-mastery/02-setup-github-cli-workspace`](./recipes/git-mastery/02-setup-github-cli-workspace) | GitHub CLI & Headless Workspace Setup | [Read Deep Dive](https://labs.zeroshot.studio/resources/how-to-set-up-github-cli-and-workspace?utm_source=github&utm_medium=repo&utm_campaign=setup-gh-cli) | `gh` CLI, SSH/GPG Auth |
| [`git-mastery/03-create-repo-scaffold-web-project`](./recipes/git-mastery/03-create-repo-scaffold-web-project) | Repo Creation & Modern Project Scaffolding | [Read Deep Dive](https://labs.zeroshot.studio/resources/how-to-create-a-github-repo-and-scaffold-a-web-project?utm_source=github&utm_medium=repo&utm_campaign=create-repo-scaffold) | Node.js, Vite, Git Hooks |
| [`git-mastery/04-clone-sync-repositories-locally`](./recipes/git-mastery/04-clone-sync-repositories-locally) | Local Cloning, Remote Tracking & Fetching | [Read Deep Dive](https://labs.zeroshot.studio/resources/how-to-clone-and-sync-github-repositories-locally?utm_source=github&utm_medium=repo&utm_campaign=clone-sync-repos) | Git Remotes, Upstreams |
| [`git-mastery/05-branch-commit-push-code`](./recipes/git-mastery/05-branch-commit-push-code) | Clean Branching & Atomic Commits | [Read Deep Dive](https://labs.zeroshot.studio/resources/how-to-branch-commit-and-push-code-on-github?utm_source=github&utm_medium=repo&utm_campaign=branch-commit-push) | Conventional Commits |
| [`git-mastery/06-review-prs-merge-cleanly`](./recipes/git-mastery/06-review-prs-merge-cleanly) | Code Review & Conflict-Free Merging | [Read Deep Dive](https://labs.zeroshot.studio/resources/how-to-review-pull-requests-and-merge-cleanly?utm_source=github&utm_medium=repo&utm_campaign=review-prs-merge) | Rebase vs Merge, Squash |
| [`git-mastery/07-deploy-actions-github-pages`](./recipes/git-mastery/07-deploy-actions-github-pages) | CI/CD Deployments via Actions & Pages | [Read Deep Dive](https://labs.zeroshot.studio/resources/how-to-deploy-web-projects-with-github-actions-and-pages?utm_source=github&utm_medium=repo&utm_campaign=deploy-actions-pages) | GitHub Actions, Pages |
| [`git-mastery/08-plan-features-issues-projects`](./recipes/git-mastery/08-plan-features-issues-projects) | Agile Issue Tracking & Projects Kanban | [Read Deep Dive](https://labs.zeroshot.studio/resources/how-to-plan-software-features-with-github-issues-and-projects?utm_source=github&utm_medium=repo&utm_campaign=plan-features-issues) | GitHub Projects, Issues |
| [`git-mastery/09-continuous-learning-stack`](./recipes/git-mastery/09-continuous-learning-stack) | Autonomous Git Learning & Verification Stack | [Read Deep Dive](https://labs.zeroshot.studio/resources/how-to-build-a-continuous-git-and-github-learning-stack?utm_source=github&utm_medium=repo&utm_campaign=continuous-learning-stack) | Python, Shell, Automation |

---

### 🤖 AI Workflows & Autonomous Agents
*Production scaffolds for Model Context Protocol (MCP), agent memory, and sandbox harnesses.*

| Recipe | Topic | Architecture & Brief | Stack |
| :--- | :--- | :--- | :--- |
| [`01-claude-mcp-agent-starter`](./recipes/01-claude-mcp-agent-starter) | Claude MCP Autonomous Agent Harness | [Read Deep Dive](https://labs.zeroshot.studio/ai-workflows/claude-mcp-agent-starter?utm_source=github&utm_medium=repo&utm_campaign=01-claude-mcp) | Python 3.11, FastMCP, Anthropic SDK, Docker |
| [`ai-workflows/claude-code-spec-first`](./recipes/ai-workflows/claude-code-spec-first) | Spec-First AI Code Generation | [Read Deep Dive](https://labs.zeroshot.studio/ai-workflows/claude-code-spec-first-workflows?utm_source=github&utm_medium=repo&utm_campaign=claude-code-spec) | Specification Engine, Claude |
| [`ai-workflows/full-stack-mcp`](./recipes/ai-workflows/full-stack-mcp) | Full-Stack MCP Architecture | [Read Deep Dive](https://labs.zeroshot.studio/ai-workflows/full-stack-mcp-cheatsheet?utm_source=github&utm_medium=repo&utm_campaign=full-stack-mcp) | FastMCP, Client/Server Wire |
| [`ai-workflows/openclaw-custom-skills`](./recipes/ai-workflows/openclaw-custom-skills) | OpenClaw Custom Skills Masterclass | [Read Deep Dive](https://labs.zeroshot.studio/ai-workflows/openclaw-custom-skills-masterclass?utm_source=github&utm_medium=repo&utm_campaign=openclaw-skills) | Custom Skills SDK, Runtime |
| [`ai-workflows/persistent-memory-agents`](./recipes/ai-workflows/persistent-memory-agents) | Multi-Tier Agent Memory Architectures | [Read Deep Dive](https://labs.zeroshot.studio/agents/persistent-memory-architectures-agents?utm_source=github&utm_medium=repo&utm_campaign=persistent-memory) | Vector Brain, SQLite, Embeddings |
| [`ai-workflows/headless-agent-vps`](./recipes/ai-workflows/headless-agent-vps) | Self-Hosting Headless Agent VPS | [Read Deep Dive](https://labs.zeroshot.studio/vps-infra/self-hosting-headless-agent-vps?utm_source=github&utm_medium=repo&utm_campaign=headless-agent-vps) | Systemd, Docker, Tailscale |
| [`ai-workflows/refactoring-vibe-coded-debt`](./recipes/ai-workflows/refactoring-vibe-coded-debt) | Taming Vibe-Coded Technical Debt: Automated Test Harnesses for AI-Generated Repos | [Read Deep Dive](https://labs.zeroshot.studio/ai-workflows/refactoring-vibe-coded-debt?utm_source=github&utm_medium=repo&utm_campaign=refactoring-vibe-coded-debt) | Python 3.11, ZeroLabs Architecture |
| [`news/mrbeast-partners-with-gemini-to-turn-impossibly-big-ideas-in`](./recipes/news/mrbeast-partners-with-gemini-to-turn-impossibly-big-ideas-in) | MrBeast partners with Gemini to turn impossibly big ideas into reality | [Read Deep Dive](https://labs.zeroshot.studio/news/mrbeast-partners-with-gemini-to-turn-impossibly-big-ideas-in?utm_source=github&utm_medium=repo&utm_campaign=mrbeast-partners-with-gemini-to-turn-impossibly-big-ideas-in) | Python 3.11, ZeroLabs Architecture |
| [`news/atv-big-air-tour-turned-3-days-of-work-into-3-hours-with-cha`](./recipes/news/atv-big-air-tour-turned-3-days-of-work-into-3-hours-with-cha) | ATV Big Air Tour turned 3 days of work into 3 hours with ChatGPT | [Read Deep Dive](https://labs.zeroshot.studio/news/atv-big-air-tour-turned-3-days-of-work-into-3-hours-with-cha?utm_source=github&utm_medium=repo&utm_campaign=atv-big-air-tour-turned-3-days-of-work-into-3-hours-with-cha) | Python 3.11, ZeroLabs Architecture |
| [`news/proactive-cyber-defense-for-governments-and-enterprises`](./recipes/news/proactive-cyber-defense-for-governments-and-enterprises) | Proactive cyber defense for governments and enterprises | [Read Deep Dive](https://labs.zeroshot.studio/news/proactive-cyber-defense-for-governments-and-enterprises?utm_source=github&utm_medium=repo&utm_campaign=proactive-cyber-defense-for-governments-and-enterprises) | Python 3.11, ZeroLabs Architecture |
| [`news/healthcare-organizations-can-now-connect-ehr-and-additional-`](./recipes/news/healthcare-organizations-can-now-connect-ehr-and-additional-) | Healthcare organizations can now connect EHR and additional industry data to ChatGPT | [Read Deep Dive](https://labs.zeroshot.studio/news/healthcare-organizations-can-now-connect-ehr-and-additional-?utm_source=github&utm_medium=repo&utm_campaign=healthcare-organizations-can-now-connect-ehr-and-additional-) | Python 3.11, ZeroLabs Architecture |
| [`ai-workflows/choosing-the-right-model`](./recipes/ai-workflows/choosing-the-right-model) | Choosing the Right AI Model: When Speed Beats Reasoning | [Read Deep Dive](https://labs.zeroshot.studio/ai-workflows/choosing-the-right-model?utm_source=github&utm_medium=repo&utm_campaign=choosing-the-right-model) | Python 3.11, ZeroLabs Architecture |
| [`ai-workflows/prompt-debt-and-context-hygiene`](./recipes/ai-workflows/prompt-debt-and-context-hygiene) | Prompt Debt and Context Hygiene: Stop AI Coding Sessions From Turning Into Sludge | [Read Deep Dive](https://labs.zeroshot.studio/ai-workflows/prompt-debt-and-context-hygiene?utm_source=github&utm_medium=repo&utm_campaign=prompt-debt-and-context-hygiene) | Python 3.11, ZeroLabs Architecture |
| [`ai-workflows/learn-german-passively-ai-coding-assistant`](./recipes/ai-workflows/learn-german-passively-ai-coding-assistant) | How I'm Learning German by Talking to My Coding AI | [Read Deep Dive](https://labs.zeroshot.studio/ai-workflows/learn-german-passively-ai-coding-assistant?utm_source=github&utm_medium=repo&utm_campaign=learn-german-passively-ai-coding-assistant) | Python 3.11, ZeroLabs Architecture |
| [`news/introducing-agentic-video-understanding-with-gemini`](./recipes/news/introducing-agentic-video-understanding-with-gemini) | Introducing agentic video understanding with Gemini | [Read Deep Dive](https://labs.zeroshot.studio/news/introducing-agentic-video-understanding-with-gemini?utm_source=github&utm_medium=repo&utm_campaign=introducing-agentic-video-understanding-with-gemini) | Python 3.11, ZeroLabs Architecture |
| [`news/try-google-pics-easy-image-creation-and-editing-in-google-wo`](./recipes/news/try-google-pics-easy-image-creation-and-editing-in-google-wo) | Try Google Pics: Easy image creation and editing in Google Workspace | [Read Deep Dive](https://labs.zeroshot.studio/news/try-google-pics-easy-image-creation-and-editing-in-google-wo?utm_source=github&utm_medium=repo&utm_campaign=try-google-pics-easy-image-creation-and-editing-in-google-wo) | Python 3.11, ZeroLabs Architecture |
| [`news/daybreak-for-frontline-defenders-1b-to-protect-essential-ser`](./recipes/news/daybreak-for-frontline-defenders-1b-to-protect-essential-ser) | Daybreak for Frontline Defenders: $1B to protect essential services | [Read Deep Dive](https://labs.zeroshot.studio/news/daybreak-for-frontline-defenders-1b-to-protect-essential-ser?utm_source=github&utm_medium=repo&utm_campaign=daybreak-for-frontline-defenders-1b-to-protect-essential-ser) | Python 3.11, ZeroLabs Architecture |
| [`news/legora-reviewed-41-documents-in-minutes-with-gpt-6-astra`](./recipes/news/legora-reviewed-41-documents-in-minutes-with-gpt-6-astra) | Legora reviewed 41 documents in minutes with GPT-6 Astra | [Read Deep Dive](https://labs.zeroshot.studio/news/legora-reviewed-41-documents-in-minutes-with-gpt-6-astra?utm_source=github&utm_medium=repo&utm_campaign=legora-reviewed-41-documents-in-minutes-with-gpt-6-astra) | Python 3.11, ZeroLabs Architecture |
| [`news/playco-cut-manual-fixes-50-prototyping-games-with-gpt-6-astr`](./recipes/news/playco-cut-manual-fixes-50-prototyping-games-with-gpt-6-astr) | Playco cut manual fixes 50% prototyping games with GPT-6 Astra | [Read Deep Dive](https://labs.zeroshot.studio/news/playco-cut-manual-fixes-50-prototyping-games-with-gpt-6-astr?utm_source=github&utm_medium=repo&utm_campaign=playco-cut-manual-fixes-50-prototyping-games-with-gpt-6-astr) | Python 3.11, ZeroLabs Architecture |
| [`news/safety-overview-gpt-6-astra`](./recipes/news/safety-overview-gpt-6-astra) | Safety overview: GPT-6 Astra | [Read Deep Dive](https://labs.zeroshot.studio/news/safety-overview-gpt-6-astra?utm_source=github&utm_medium=repo&utm_campaign=safety-overview-gpt-6-astra) | Python 3.11, ZeroLabs Architecture |
| [`news/gpt-4`](./recipes/news/gpt-4) | GPT-4 | [Read Deep Dive](https://labs.zeroshot.studio/news/gpt-4?utm_source=github&utm_medium=repo&utm_campaign=gpt-4) | Python 3.11, ZeroLabs Architecture |
| [`news/create-your-best-tracks-yet-with-lyria-35-in-gemini`](./recipes/news/create-your-best-tracks-yet-with-lyria-35-in-gemini) | Create your best tracks yet with Lyria 3.5 in Gemini. | [Read Deep Dive](https://labs.zeroshot.studio/news/create-your-best-tracks-yet-with-lyria-35-in-gemini?utm_source=github&utm_medium=repo&utm_campaign=create-your-best-tracks-yet-with-lyria-35-in-gemini) | Python 3.11, ZeroLabs Architecture |
| [`ai-workflows/debugging-ai-generated-code-without-rage`](./recipes/ai-workflows/debugging-ai-generated-code-without-rage) | Debugging AI-Generated Code Without Rage: The 4-Step Protocol | [Read Deep Dive](https://labs.zeroshot.studio/ai-workflows/debugging-ai-generated-code-without-rage?utm_source=github&utm_medium=repo&utm_campaign=debugging-ai-generated-code-without-rage) | Python 3.11, ZeroLabs Architecture |
| [`news/gpt-6-astra-a-new-generation-of-intelligence`](./recipes/news/gpt-6-astra-a-new-generation-of-intelligence) | GPT-6 Astra: A new generation of intelligence | [Read Deep Dive](https://labs.zeroshot.studio/news/gpt-6-astra-a-new-generation-of-intelligence?utm_source=github&utm_medium=repo&utm_campaign=gpt-6-astra-a-new-generation-of-intelligence) | Python 3.11, ZeroLabs Architecture |
| [`ai-workflows/deterministic-circuit-breakers-in-agentic-pipelines`](./recipes/ai-workflows/deterministic-circuit-breakers-in-agentic-pipelines) | The Circuit Breaker Pattern: Why Deterministic Code Hooks Beat Agent Self-Correction in Production LLM Pipelines | [Read Deep Dive](https://labs.zeroshot.studio/agents/deterministic-circuit-breakers-in-agentic-pipelines?utm_source=github&utm_medium=repo&utm_campaign=deterministic-circuit-breakers-in-agentic-pipelines) | Python 3.11, ZeroLabs Architecture |
| [`ai-workflows/best-open-source-project-management-ui-agents`](./recipes/ai-workflows/best-open-source-project-management-ui-agents) | Best Open Source Project Management UI for Agents | [Read Deep Dive](https://labs.zeroshot.studio/ai-workflows/best-open-source-project-management-ui-agents?utm_source=github&utm_medium=repo&utm_campaign=best-open-source-project-management-ui-agents) | Python 3.11, Docker, ZeroLabs Architecture |
| [`news/research-acceleration-the-view-inside-openai`](./recipes/news/research-acceleration-the-view-inside-openai) | Research acceleration: The view inside OpenAI | [Read Deep Dive](https://labs.zeroshot.studio/news/research-acceleration-the-view-inside-openai?utm_source=github&utm_medium=repo&utm_campaign=research-acceleration-the-view-inside-openai) | Python 3.11, ZeroLabs Architecture |
| [`news/an-alien-mind`](./recipes/news/an-alien-mind) | An Alien Mind | [Read Deep Dive](https://labs.zeroshot.studio/news/an-alien-mind?utm_source=github&utm_medium=repo&utm_campaign=an-alien-mind) | Python 3.11, ZeroLabs Architecture |
| [`ai-workflows/simple-ai-workflows-before-agents`](./recipes/ai-workflows/simple-ai-workflows-before-agents) | Simple AI Workflows Before Agents: When a Script Beats Orchestration | [Read Deep Dive](https://labs.zeroshot.studio/agents/simple-ai-workflows-before-agents?utm_source=github&utm_medium=repo&utm_campaign=simple-ai-workflows-before-agents) | Python 3.11, ZeroLabs Architecture |
| [`news/supporting-independent-journalism-in-ukraine`](./recipes/news/supporting-independent-journalism-in-ukraine) | Supporting independent journalism in Ukraine | [Read Deep Dive](https://labs.zeroshot.studio/news/supporting-independent-journalism-in-ukraine?utm_source=github&utm_medium=repo&utm_campaign=supporting-independent-journalism-in-ukraine) | Python 3.11, ZeroLabs Architecture |
| [`ai-workflows/passive-skill-acquisition-terminal-coding-agents`](./recipes/ai-workflows/passive-skill-acquisition-terminal-coding-agents) | Passive Skill Acquisition for Terminal AI Coding Agents: Embedding Context Triggers in Custom Instructions | [Read Deep Dive](https://labs.zeroshot.studio/agents/passive-skill-acquisition-terminal-coding-agents?utm_source=github&utm_medium=repo&utm_campaign=passive-skill-acquisition-terminal-coding-agents) | Python 3.11, ZeroLabs Architecture |
| [`ai-workflows/setting-up-ai-coding-agents-claude-code-codex-and-gemini-cli`](./recipes/ai-workflows/setting-up-ai-coding-agents-claude-code-codex-and-gemini-cli) | Setting Up AI Coding Agents: A Practical Guide to Claude Code, Copilot, and Gemini CLI | [Read Deep Dive](https://labs.zeroshot.studio/ai-workflows/setting-up-ai-coding-agents-claude-code-codex-and-gemini-cli?utm_source=github&utm_medium=repo&utm_campaign=setting-up-ai-coding-agents-claude-code-codex-and-gemini-cli) | Python 3.11, ZeroLabs Architecture |
| [`news/the-work-now-within-reach`](./recipes/news/the-work-now-within-reach) | The Work Now Within Reach | [Read Deep Dive](https://labs.zeroshot.studio/news/the-work-now-within-reach?utm_source=github&utm_medium=repo&utm_campaign=the-work-now-within-reach) | Python 3.11, ZeroLabs Architecture |
| [`news/introducing-chatgpt-images-25`](./recipes/news/introducing-chatgpt-images-25) | Introducing ChatGPT Images 2.5 | [Read Deep Dive](https://labs.zeroshot.studio/news/introducing-chatgpt-images-25?utm_source=github&utm_medium=repo&utm_campaign=introducing-chatgpt-images-25) | Python 3.11, ZeroLabs Architecture |
| [`news/how-gpt-56-sol-helps-run-quantum-computing-experiments`](./recipes/news/how-gpt-56-sol-helps-run-quantum-computing-experiments) | How GPT-5.6 Sol helps run quantum computing experiments | [Read Deep Dive](https://labs.zeroshot.studio/news/how-gpt-56-sol-helps-run-quantum-computing-experiments?utm_source=github&utm_medium=repo&utm_campaign=how-gpt-56-sol-helps-run-quantum-computing-experiments) | Python 3.11, ZeroLabs Architecture |
| [`news/on-the-navier-stokes-millennium-prize-problem`](./recipes/news/on-the-navier-stokes-millennium-prize-problem) | On the Navier - Stokes Millennium Prize Problem | [Read Deep Dive](https://labs.zeroshot.studio/news/on-the-navier-stokes-millennium-prize-problem?utm_source=github&utm_medium=repo&utm_campaign=on-the-navier-stokes-millennium-prize-problem) | Python 3.11, ZeroLabs Architecture |
| [`ai-workflows/when-you-actually-need-an-agent`](./recipes/ai-workflows/when-you-actually-need-an-agent) | When You Actually Need an Agent: A Decision Tree for Beginners | [Read Deep Dive](https://labs.zeroshot.studio/agents/when-you-actually-need-an-agent?utm_source=github&utm_medium=repo&utm_campaign=when-you-actually-need-an-agent) | Python 3.11, ZeroLabs Architecture |
| [`news/funding-grants-for-new-research-into-ai-and-teen-development`](./recipes/news/funding-grants-for-new-research-into-ai-and-teen-development) | Funding grants for new research into AI and teen development | [Read Deep Dive](https://labs.zeroshot.studio/news/funding-grants-for-new-research-into-ai-and-teen-development?utm_source=github&utm_medium=repo&utm_campaign=funding-grants-for-new-research-into-ai-and-teen-development) | Python 3.11, ZeroLabs Architecture |

---

## 🚀 Quick Start Example

Run the flagship Claude MCP agent starter in seconds:

```bash
# 1. Clone this repository
git clone https://github.com/zeroshotstudio/zerolabs-recipes.git
cd zerolabs-recipes/recipes/01-claude-mcp-agent-starter

# 2. Configure environment
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env

# 3. Spin up with Docker Compose
docker compose up -d --build

# 4. Verify test harness
python3 test_agent.py
```

---

## 🛠️ Repository Architecture

```
zerolabs-recipes/
├── .github/
│   ├── ISSUE_TEMPLATE/        # Standardized proposal & bug templates
│   │   ├── bug_report.yml
│   │   └── recipe_proposal.yml
│   ├── workflows/
│   │   └── ci.yml             # Automated syntax and container linting
│   └── pull_request_template.md
├── recipes/
│   ├── 01-claude-mcp-agent-starter/   # Flagship MCP agent harness
│   │   ├── Dockerfile
│   │   ├── docker-compose.yml
│   │   ├── app.py
│   │   ├── test_agent.py
│   │   └── README.md
│   ├── git-mastery/           # Complete 9-part GitHub learning blueprint
│   │   ├── 01-github-for-beginners/
│   │   ├── ...
│   │   └── 09-continuous-learning-stack/
│   └── ai-workflows/          # Production AI agent & MCP patterns
│       ├── claude-code-spec-first/
│       ├── full-stack-mcp/
│       ├── openclaw-custom-skills/
│       ├── persistent-memory-agents/
│       └── headless-agent-vps/
├── CONTRIBUTING.md            # Modern engineering & PR guidelines
├── LICENSE                    # MIT Open-Source License
└── README.md
```

---

## 🤝 Contributing

We welcome community recipe proposals, bug fixes, and workflow improvements! Please read our [Contribution Guidelines](CONTRIBUTING.md) before opening a Pull Request or submitting an Issue.

---

## 📄 License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for details.

Maintained with 🖤 by **[ZeroShot Studio](https://zeroshot.studio)**.
