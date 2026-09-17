# Anthropic API Key & Environment Variable Management Recipe

Deterministic recipe for loading, validating, and rotating Anthropic API keys across Python, TypeScript, Docker, and systemd environments without leaking credentials.

## Files
- `python/secure_loader.py`: Python loader with credential validation, masking, and fallback rotation.
- `typescript/secure_loader.ts`: TypeScript loader with error boundaries and key masking.
- `audit_secrets.sh`: Shell probe to audit environment variables and verify zero git leaks.
- `docker-compose.yml`: Production Docker Compose pattern using Docker secrets / env file isolation.
- `.env.example`: Safe environment template with dummy placeholder values.

## Quick Start
```bash
# 1. Copy template and add your Anthropic key
cp .env.example .env
chmod 600 .env

# 2. Run Python credential validation
python3 python/secure_loader.py

# 3. Run audit probe
bash audit_secrets.sh
```
