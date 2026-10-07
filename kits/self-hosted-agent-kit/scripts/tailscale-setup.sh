#!/usr/bin/env bash
# tailscale-setup.sh — ZeroVPS Zero-Public-Port Production Helper
# Configures Tailscale Serve & Funnel to run your Agent Infrastructure behind a private mesh
# with ZERO exposed public ports on Shodan or internet port scanners.
set -euo pipefail

echo "=========================================================="
echo "  ZeroVPS Zero-Public-Port Tailscale Mesh Configurator"
echo "  ZeroShot Studio Production Kit"
echo "=========================================================="

if ! command -v tailscale &>/dev/null; then
    echo "[+] Installing Tailscale..."
    curl -fsSL https://tailscale.com/install.sh | sh
fi

# Verify tailscale status
if ! tailscale status &>/dev/null; then
    echo "[-] Tailscale daemon is not authenticated. Please authenticate:"
    echo "    sudo tailscale up"
    exit 1
fi

TS_IP=$(tailscale ip -4)
TS_NAME=$(tailscale status --json | grep -o '"DNSName":"[^"]*' | head -1 | cut -d'"' -f4 | sed 's/\.$//')

echo "[+] Detected Tailnet Node:"
echo "    Tailscale IP: ${TS_IP}"
echo "    Tailnet FQDN: ${TS_NAME}"

echo ""
echo "Choose your access model:"
echo "1) Private Tailnet Only (Zero public ports. Accessible ONLY from your devices with Tailscale active)"
echo "2) Tailscale Funnel on Standard Port (Publicly accessible via Tailscale edge relay with TLS, zero host port forwards)"
echo ""
read -r -p "Select option [1/2, default 1]: " OPTION
OPTION="${OPTION:-1}"

if [[ "${OPTION}" == "1" ]]; then
    echo "[+] Binding Agent Stack to private Tailnet (Port 443 with HTTPS)..."
    tailscale serve --https=443 http://127.0.0.1:3080
    echo ""
    echo "✅ Success! Agent Dashboard is live on your private mesh:"
    echo "   https://${TS_NAME}"
    echo "   (Accessible on iOS, Android, macOS, and Linux with Tailscale on. Zero public ports open!)"
else
    echo "[+] Enabling Tailscale Funnel on Port 10000 (Global Edge Relay)..."
    tailscale funnel --https=10000 --bg http://127.0.0.1:3080
    echo ""
    echo "✅ Success! Agent Dashboard is live via Funnel edge relay:"
    echo "   https://${TS_NAME}:10000"
fi
