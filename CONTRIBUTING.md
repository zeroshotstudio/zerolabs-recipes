# Contributing to ZeroLabs Recipes 🧪

Thank you for contributing to `zerolabs-recipes`, the official open-source companion monorepo for [ZeroLabs Intelligence Briefs](https://labs.zeroshot.studio).

Our mission is to provide clean, reproducible, production-grade recipes, autonomous agent templates, and developer tooling. We want this repository to serve as the benchmark example of how modern teams and AI agents build, document, test, and release software on GitHub.

---

## 📐 Recipe Standards

Every recipe inside `recipes/` must adhere to these foundational rules:

1. **Self-Contained & Deterministic:**
   - Every recipe lives in its own dedicated directory.
   - It must include its own dependency manifest (`requirements.txt`, `package.json`, or `go.mod`), execution harness, `.env.example`, and comprehensive `README.md`.
   - Prefer containerization via `docker-compose.yml` or `Dockerfile` so users can run it instantly without dependency hell.

2. **Zero Hardcoded Secrets:**
   - Never commit API keys, tokens, or production endpoints.
   - Always provide `.env.example` with clear dummy variables and comments explaining where keys can be obtained.

3. **Canonical Linkage & Documentation:**
   - Each recipe's `README.md` must link back to the deep-dive architectural brief on [ZeroLabs](https://labs.zeroshot.studio) with appropriate UTM tags (`?utm_source=github&utm_medium=repo&utm_campaign=<recipe-name>`).
   - Clearly document prerequisites, setup instructions, verification commands, and architecture diagrams.

4. **Code Quality & CI Testing:**
   - All Python code must pass automated linting (`flake8` syntax checks) and avoid syntax errors.
   - Docker Compose configurations must pass `docker compose config` validation.

---

## 🌿 Git Workflow: How We Branch, Commit, and PR

We practice clean trunk-based development with short-lived feature branches:

### 1. Branch Naming
- `feat/<recipe-or-topic>`: New recipes or major capabilities (e.g., `feat/02-multi-agent-state-sync`)
- `fix/<recipe-or-topic>`: Bug fixes or dependency patches (e.g., `fix/mcp-fastmcp-version`)
- `docs/<topic>`: Documentation, guides, or sitemap updates (e.g., `docs/git-mastery-index`)

### 2. Conventional Commits
All commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:
- `feat(category): add new recipe for ...`
- `fix(agent-starter): resolve docker-compose healthcheck timeout`
- `docs(readme): add badges and recipe index`
- `test(ci): validate docker compose configs in github actions`

### 3. Submitting a Pull Request
1. Fork or branch from `main`.
2. Implement your recipe or fix.
3. Test locally (`python3 ...` or `docker compose up`).
4. Push your branch and open a Pull Request using our PR template.
5. Automated CI will run linters and container validation.

---

## 🛡️ Code of Conduct

Be constructive, respectful, and focused on building open, accessible developer tools.
