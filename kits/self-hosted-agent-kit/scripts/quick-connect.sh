#!/usr/bin/env bash
# ==============================================================================
# ZeroLabs Self-Hosted Agent Kit // 1-Click Agent Quick Connect
# Frontier AI & Framework Integration Hub
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
AMBER='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'
BOLD='\033[1m'

echo -e "${CYAN}${BOLD}"
echo "=================================================================="
echo "    ⚡ ZEROLABS // ONE-CLICK FRONTIER AI QUICK CONNECT HUB ⚡    "
echo "=================================================================="
echo -e "${NC}"

# Read .env if available
ENV_FILE="${ROOT_DIR}/.env"
DB_USER="agent"
DB_PASS="agent_secure_pass_2026"
DB_NAME="agentdb"
DB_PORT="5432"
REDIS_PORT="6379"

if [ -f "$ENV_FILE" ]; then
  DB_USER=$(grep -E '^POSTGRES_USER=' "$ENV_FILE" | cut -d '=' -f2- || echo "agent")
  DB_PASS=$(grep -E '^POSTGRES_PASSWORD=' "$ENV_FILE" | cut -d '=' -f2- || echo "your_secret_here")
  DB_NAME=$(grep -E '^POSTGRES_DB=' "$ENV_FILE" | cut -d '=' -f2- || echo "agentdb")
fi

STACK_HOST="http://127.0.0.1:3080"
POSTGRES_URI="postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:${DB_PORT}/${DB_NAME}" # your_secret_here

echo "Which Frontier AI or Agent framework do you want to connect?"
echo "  1) OpenAI / Codex (Python SDK & Function Calling)"
echo "  2) Google Antigravity (DeepMind AGY CLI & IDE MCP)"
echo "  3) Claude Code / Claude Desktop (Model Context Protocol)"
echo "  4) Cursor / Windsurf AI IDE (.cursor/mcp.json)"
echo "  5) Google Gemini (GenAI SDK & Tool Calling)"
echo "  6) Python Agent (LangChain / CrewAI / AutoGen / LlamaIndex)"
echo "  7) Node.js / OpenClaw Agent"
echo "  8) No-Code Webhooks (n8n / Make / Zapier)"
echo "  9) Test Stack Connection (Ping Heartbeat)"
echo ""
read -rp "Enter choice [1-9]: " CHOICE

case "$CHOICE" in
  1)
    echo -e "\n${CYAN}>>> Setting up OpenAI & Codex Agent Starter...${NC}"
    cp "${ROOT_DIR}/templates/openai_agent.py" "${ROOT_DIR}/openai_agent.py"
    chmod +x "${ROOT_DIR}/openai_agent.py"
    echo -e "${GREEN}✅ Created:${NC} ${ROOT_DIR}/openai_agent.py"
    echo "Run with: python3 openai_agent.py 'Analyze customer churn signals'"
    ;;

  2)
    echo -e "\n${CYAN}>>> Setting up Google Antigravity (AGY) MCP Config...${NC}"
    AGY_CONFIG_DIR="$HOME/.gemini/antigravity-cli"
    mkdir -p "$AGY_CONFIG_DIR"
    cp "${ROOT_DIR}/templates/antigravity_mcp.json" "${AGY_CONFIG_DIR}/mcp_config.json"
    cp "${ROOT_DIR}/templates/antigravity_mcp.json" "${ROOT_DIR}/antigravity_mcp.json"
    echo -e "${GREEN}✅ Installed Antigravity MCP Config:${NC} ${AGY_CONFIG_DIR}/mcp_config.json"
    echo -e "${GREEN}✅ Local Project Copy:${NC} ${ROOT_DIR}/antigravity_mcp.json"
    echo "Antigravity CLI and IDE now have direct access to PostgreSQL 17!"
    ;;

  3)
    echo -e "\n${CYAN}>>> Setting up Claude Desktop / Claude Code MCP...${NC}"
    CLAUDE_CONFIG_DIR="$HOME/.config/claude"
    if [[ "$OSTYPE" == "darwin"* ]]; then
      CLAUDE_CONFIG_DIR="$HOME/Library/Application Support/Claude"
    fi
    mkdir -p "$CLAUDE_CONFIG_DIR"
    TARGET_FILE="$CLAUDE_CONFIG_DIR/claude_desktop_config.json"
    
    cat <<EOF > "$TARGET_FILE"
{
  "mcpServers": {
    "zerolabs-agent-stack": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "${POSTGRES_URI}"
      ]
    }
  }
}
EOF
    echo -e "${GREEN}✅ Generated Claude MCP Config:${NC} ${TARGET_FILE}"
    echo "Restart Claude Desktop or Claude Code to start querying PostgreSQL 17 live!"
    ;;

  4)
    echo -e "\n${CYAN}>>> Setting up Cursor / Windsurf AI IDE...${NC}"
    mkdir -p "$ROOT_DIR/.cursor"
    cat <<EOF > "$ROOT_DIR/.cursor/mcp.json"
{
  "mcpServers": {
    "zerolabs-agent-stack": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "${POSTGRES_URI}"
      ]
    }
  }
}
EOF
    echo -e "${GREEN}✅ Created Cursor MCP config:${NC} ${ROOT_DIR}/.cursor/mcp.json"
    echo "Your AI IDE can now inspect task ledgers and databases in real-time."
    ;;

  5)
    echo -e "\n${CYAN}>>> Setting up Google Gemini Agent Starter...${NC}"
    cp "${ROOT_DIR}/templates/gemini_agent.py" "${ROOT_DIR}/gemini_agent.py"
    chmod +x "${ROOT_DIR}/gemini_agent.py"
    echo -e "${GREEN}✅ Created:${NC} ${ROOT_DIR}/gemini_agent.py"
    echo "Run with: python3 gemini_agent.py 'Audit repository health'"
    ;;

  6)
    echo -e "\n${CYAN}>>> Generating Python Agent Starter (LangChain / CrewAI)...${NC}"
    cp "${ROOT_DIR}/templates/agent_starter.py" "${ROOT_DIR}/my_agent.py"
    chmod +x "${ROOT_DIR}/my_agent.py"
    echo -e "${GREEN}✅ Created:${NC} ${ROOT_DIR}/my_agent.py"
    echo "Run it immediately with: python3 my_agent.py 'My autonomous task'"
    ;;

  7)
    echo -e "\n${CYAN}>>> Generating Node.js / OpenClaw Agent Starter...${NC}"
    cp "${ROOT_DIR}/templates/agent_starter.js" "${ROOT_DIR}/my_agent.js"
    chmod +x "${ROOT_DIR}/my_agent.js"
    echo -e "${GREEN}✅ Created:${NC} ${ROOT_DIR}/my_agent.js"
    echo "Run it immediately with: node my_agent.js 'My autonomous task'"
    ;;

  8)
    echo -e "\n${CYAN}>>> Webhook Endpoint Details (n8n, Make, Zapier)...${NC}"
    echo -e "Endpoint URL: ${BOLD}${STACK_HOST}/api/agent/dispatch${NC}"
    echo -e "Method:       ${BOLD}POST${NC}"
    echo -e "Content-Type: ${BOLD}application/json${NC}"
    echo -e "Payload Example:"
    echo '  {"agent_name": "n8n-workflow", "framework": "n8n", "prompt": "Process user invoice"}'
    echo ""
    echo "Test with curl:"
    echo "curl -X POST ${STACK_HOST}/api/agent/dispatch -H 'Content-Type: application/json' -d '{\"agent_name\":\"curl-test\",\"framework\":\"webhook\",\"prompt\":\"Test dispatch\"}'"
    ;;

  9)
    echo -e "\n${CYAN}>>> Testing Stack Connection...${NC}"
    curl -fsS "${STACK_HOST}/api/agent/ping" \
      -H "Content-Type: application/json" \
      -d '{"name":"quick-connect-cli","framework":"cli","version":"1.0"}' || {
        echo -e "${RED}❌ Failed to connect to stack at ${STACK_HOST}.${NC}"
        exit 1
      }
    echo -e "\n${GREEN}✅ Stack is alive, responsive, and ready for agents!${NC}"
    ;;

  *)
    echo -e "${RED}Invalid choice.${NC}"
    exit 1
    ;;
esac

echo -e "\n${GREEN}${BOLD}Agent connection completed successfully!${NC}\n"
