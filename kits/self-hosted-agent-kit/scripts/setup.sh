#!/usr/bin/env bash
# setup.sh — 1-Command Bootstrap for Self-Hosted Agent Stack on Ubuntu 22.04/24.04 LTS
set -euo pipefail

echo "=========================================================="
echo "  Self-Hosted Agent Infrastructure Stack Installer"
echo "  ZeroShot Studio Production Kit"
echo "=========================================================="

if [[ $EUID -ne 0 ]]; then
   echo "[-] Please run as root or with sudo." 
   exit 1
fi

STACK_DIR="/opt/agent-stack"
INSTALL_SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[+] Updating apt repositories..."
apt-get update -y

echo "[+] Installing baseline dependencies..."
apt-get install -y curl git ufw fail2ban python3 python3-pip jq ca-certificates gnupg

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "[+] Installing Docker Engine..."
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

# Configure UFW firewall
echo "[+] Hardening host with UFW..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP ACME Challenge'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable

# Deploy stack directory
echo "[+] Deploying files to ${STACK_DIR}..."
mkdir -p "${STACK_DIR}"
cp -a "${INSTALL_SOURCE_DIR}/." "${STACK_DIR}/"

cd "${STACK_DIR}"

# Initialize .env if missing
if [[ ! -f ".env" ]]; then
    echo "[+] Generating production .env with cryptographically secure credentials..."
    PG_PASS=$(openssl rand -hex 24)
    REDIS_PASS=$(openssl rand -hex 24)
    
    cp .env.example .env
    sed -i "s/POSTGRES_PASSWORD=CHANGEME_SECURE_PASSWORD/POSTGRES_PASSWORD=${PG_PASS}/" .env
    sed -i "s/REDIS_PASSWORD=CHANGEME_SECURE_REDIS_PASSWORD/REDIS_PASSWORD=${REDIS_PASS}/" .env
    echo "[!] .env generated with random database and redis passwords."
fi

# Deploy systemd units
echo "[+] Configuring systemd services..."
cp systemd/agent-stack.service /etc/systemd/system/
cp systemd/agent-watchdog.service /etc/systemd/system/
cp systemd/agent-watchdog.timer /etc/systemd/system/

systemctl daemon-reload
systemctl enable agent-stack.service
systemctl enable --now agent-watchdog.timer

echo "=========================================================="
echo "  Installation Complete!"
echo "  1. Edit ${STACK_DIR}/.env to configure your APP_DOMAIN, ACME_EMAIL,"
echo "     and Telegram alert credentials."
echo "  2. Start the stack:"
echo "     systemctl start agent-stack.service"
echo "  3. Check container logs:"
echo "     docker compose -f ${STACK_DIR}/docker-compose.yml logs -f"
echo "=========================================================="
