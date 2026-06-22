#!/usr/bin/env bash
# Test the Oberlicht installer in a clean Docker container.
# Usage:
#   ./test-install.sh            # Ubuntu 22.04 (default)
#   ./test-install.sh mint       # Linux Mint 22
#   ./test-install.sh ubuntu24   # Ubuntu 24.04

set -euo pipefail

TARGET="${1:-ubuntu22}"

case "$TARGET" in
    ubuntu22|ubuntu)  IMAGE="ubuntu:22.04"               LABEL="Ubuntu 22.04" ;;
    ubuntu24)         IMAGE="ubuntu:24.04"               LABEL="Ubuntu 24.04" ;;
    mint|mint22)      IMAGE="linuxmintd/mint22-amd64"    LABEL="Linux Mint 22" ;;
    mint21)           IMAGE="linuxmintd/mint21-amd64"    LABEL="Linux Mint 21" ;;
    fedora|fedora41)  IMAGE="fedora:41"                  LABEL="Fedora 41" ;;
    fedora40)         IMAGE="fedora:40"                  LABEL="Fedora 40" ;;
    *)  echo "Usage: $0 [ubuntu22|ubuntu24|mint21|mint22|fedora]"; exit 1 ;;
esac

BOLD='\033[1m'; CYAN='\033[0;36m'; GREEN='\033[0;32m'; NC='\033[0m'

echo -e "\n${BOLD}Oberlicht install test${NC} → ${CYAN}${LABEL}${NC} (${IMAGE})\n"

# The installer needs sudo — in Docker we're root, so fake it with a wrapper.
# Also: no systemd, no display — installer runs non-interactively for GPG/pass.
docker run --rm -i \
    --name "obl-test-$$" \
    "$IMAGE" \
    bash -euo pipefail << 'DOCKERSCRIPT'

# ── Fake sudo (we're root in the container) ──────────────────────────────────
cat > /usr/local/bin/sudo << 'EOF'
#!/bin/sh
exec "$@"
EOF
chmod +x /usr/local/bin/sudo

# ── Fake interactive prompts (answer Y to everything) ─────────────────────────
export DEBIAN_FRONTEND=noninteractive

# ── Bootstrap curl + gpg (distro-aware) ──────────────────────────────────────
if command -v apt-get &>/dev/null; then
    apt-get update -qq
    apt-get install -y curl ca-certificates gnupg 2>&1 | grep -E "^(Setting|Preparing|Get|Err|W:)" || true
elif command -v dnf &>/dev/null; then
    dnf install -y curl gnupg2 ca-certificates 2>&1 | grep -E "^(Installing|Upgrading|Complete)" || true
elif command -v zypper &>/dev/null; then
    zypper install -y curl gpg2 ca-certificates 2>&1 | grep -E "^(Installing|Downloading)" || true
fi

echo ""
echo "════════════════════════════════════════════════════════"
echo "  Running Oberlicht installer"
echo "════════════════════════════════════════════════════════"
echo ""

# Run installer non-interactively: auto-answer all prompts with Y
yes "y" | bash <(curl -fsSL \
    https://raw.githubusercontent.com/alexander-graf/oberlicht/main/install.sh) \
    || true

echo ""
echo "════════════════════════════════════════════════════════"
echo "  Post-install checks"
echo "════════════════════════════════════════════════════════"

check() {
    local label="$1"; local cmd="$2"
    if eval "$cmd" &>/dev/null; then
        echo "  ✓ $label"
    else
        echo "  ✗ $label  ← MISSING"
    fi
}

check "pass"            "command -v pass"
check "gpg"             "command -v gpg"
check "xdotool"         "command -v xdotool"
check "xclip"           "command -v xclip"
check "oberlicht binary" "test -x /root/.local/bin/oberlicht"
check "icon file"       "test -f /root/.local/share/icons/hicolor/512x512/apps/oberlicht.png"
check ".desktop entry"  "test -f /root/.local/share/applications/oberlicht.desktop"

echo ""
DOCKERSCRIPT

echo -e "\n${GREEN}Test finished.${NC}\n"
