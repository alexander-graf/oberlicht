#!/usr/bin/env bash
# Oberlicht installer — https://github.com/alexander-graf/oberlicht
# Idempotent: safe to run multiple times.
set -euo pipefail

REPO="alexander-graf/oberlicht"
BIN_NAME="oberlicht"
INSTALL_DIR="$HOME/.local/bin"
DESKTOP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${CYAN}▸${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC} $*"; }
die()     { echo -e "${RED}✗${NC} $*" >&2; exit 1; }
header()  { echo -e "\n${BOLD}── $* ──${NC}"; }
ask()     { echo -e "${YELLOW}?${NC} $*"; }

# ── Banner ────────────────────────────────────────────────────────────────────
echo -e "${CYAN}"
cat << 'EOF'
  ___  _               _ _      _     _
 / _ \| |__   ___ _ __| (_) ___| |__ | |_
| | | | '_ \ / _ \ '__| | |/ __| '_ \| __|
| |_| | |_) |  __/ |  | | | (__| | | | |_
 \___/|_.__/ \___|_|  |_|_|\___|_| |_|\__|
EOF
echo -e "${NC}"
echo -e "  GUI frontend for the ${BOLD}pass${NC} password manager"
echo -e "  https://github.com/${REPO}"
echo ""

# ── Detect distro ─────────────────────────────────────────────────────────────
header "System"

DISTRO=""
PKG_MANAGER=""

if command -v apt-get &>/dev/null; then
    PKG_MANAGER="apt"
    if grep -qi "mint" /etc/os-release 2>/dev/null; then
        DISTRO="Linux Mint"
    elif grep -qi "ubuntu" /etc/os-release 2>/dev/null; then
        DISTRO="Ubuntu"
    else
        DISTRO="Debian/Ubuntu"
    fi
elif command -v pacman &>/dev/null; then
    PKG_MANAGER="pacman"
    DISTRO="Arch Linux"
elif command -v dnf &>/dev/null; then
    PKG_MANAGER="dnf"
    DISTRO="Fedora"
elif command -v zypper &>/dev/null; then
    PKG_MANAGER="zypper"
    DISTRO="openSUSE"
else
    die "Could not detect a supported package manager (apt / pacman / dnf / zypper)."
fi

IS_WAYLAND=false
[[ -n "${WAYLAND_DISPLAY:-}" ]] && IS_WAYLAND=true

success "Distro: ${BOLD}${DISTRO}${NC} | $(${IS_WAYLAND} && echo Wayland || echo X11)"

if [[ "$PKG_MANAGER" != "apt" ]]; then
    warn "Pre-built binaries are only for Ubuntu/Mint (built on Ubuntu 22.04)."
    echo ""
    echo -e "  For ${BOLD}${DISTRO}${NC}, build from source:"
    echo -e "  ${CYAN}https://github.com/${REPO}#build-from-source${NC}"
    echo ""
    read -rp "  Install runtime dependencies only and continue? [y/N] " REPLY
    [[ "${REPLY,,}" == "y" ]] || exit 0
fi

# ── Install runtime dependencies ──────────────────────────────────────────────
header "Dependencies"

install_apt() {
    local missing=()
    for p in "$@"; do
        dpkg -s "$p" &>/dev/null || missing+=("$p")
    done
    if [[ ${#missing[@]} -gt 0 ]]; then
        info "Installing: ${missing[*]}"
        sudo apt-get update -qq
        sudo apt-get install -y "${missing[@]}"
    else
        success "Already installed: $*"
    fi
}

case "$PKG_MANAGER" in
    apt)
        install_apt pass gpg xdotool xclip openssh-client curl
        $IS_WAYLAND && { install_apt wl-clipboard || warn "wl-clipboard not available"; }
        ;;
    pacman)
        for p in pass gnupg xdotool xclip openssh; do
            pacman -Qi "$p" &>/dev/null || sudo pacman -S --noconfirm "$p"
        done
        $IS_WAYLAND && { pacman -Qi wl-clipboard &>/dev/null || sudo pacman -S --noconfirm wl-clipboard; }
        ;;
    dnf)
        sudo dnf install -y pass gnupg2 xdotool xclip openssh curl
        $IS_WAYLAND && sudo dnf install -y wl-clipboard
        ;;
    zypper)
        sudo zypper install -y password-store gpg2 xdotool xclip openssh curl
        $IS_WAYLAND && sudo zypper install -y wl-clipboard
        ;;
esac

success "Runtime dependencies ready."

# ── Download & install binary (Ubuntu/Mint only) ──────────────────────────────
if [[ "$PKG_MANAGER" == "apt" ]]; then
    header "Oberlicht binary"

    RELEASE_URL=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
        | grep "browser_download_url" \
        | grep "linux-amd64.tar.gz" \
        | head -1 \
        | cut -d'"' -f4)

    [[ -z "$RELEASE_URL" ]] && die "No release binary found. Check https://github.com/${REPO}/releases"

    CURRENT_VERSION=""
    [[ -x "$INSTALL_DIR/$BIN_NAME" ]] && CURRENT_VERSION=$("$INSTALL_DIR/$BIN_NAME" --version 2>/dev/null || true)
    LATEST_VERSION=$(basename "$(dirname "$RELEASE_URL")")

    if [[ -x "$INSTALL_DIR/$BIN_NAME" ]]; then
        info "Installed: ${CURRENT_VERSION:-unknown} → Latest: ${LATEST_VERSION}"
    fi

    TMPDIR_DL=$(mktemp -d)
    trap 'rm -rf "$TMPDIR_DL"' EXIT

    info "Downloading ${LATEST_VERSION}…"
    curl -fsSL --progress-bar "$RELEASE_URL" -o "$TMPDIR_DL/oberlicht.tar.gz"
    tar xzf "$TMPDIR_DL/oberlicht.tar.gz" -C "$TMPDIR_DL"

    mkdir -p "$INSTALL_DIR"
    install -Dm755 "$TMPDIR_DL/$BIN_NAME" "$INSTALL_DIR/$BIN_NAME"
    success "Binary installed to $INSTALL_DIR/$BIN_NAME"

    # Icon
    if [[ -f "$TMPDIR_DL/oberlicht.png" ]]; then
        mkdir -p "$ICON_DIR"
        cp "$TMPDIR_DL/oberlicht.png" "$ICON_DIR/oberlicht.png"
        gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
        success "Icon installed."
    fi

    # PATH
    for RC in "$HOME/.bashrc" "$HOME/.zshrc"; do
        if [[ -f "$RC" ]] && ! grep -q "$INSTALL_DIR" "$RC" 2>/dev/null; then
            echo "" >> "$RC"
            echo "export PATH=\"\$PATH:$INSTALL_DIR\"" >> "$RC"
            warn "Added $INSTALL_DIR to PATH in $RC — open a new terminal or run: source $RC"
        fi
    done

    # .desktop
    mkdir -p "$DESKTOP_DIR"
    cat > "$DESKTOP_DIR/oberlicht.desktop" << EOF
[Desktop Entry]
Name=Oberlicht
Comment=pass Password Manager Frontend
Exec=$INSTALL_DIR/oberlicht
Icon=$ICON_DIR/oberlicht.png
Type=Application
Categories=Utility;Security;
Keywords=password;pass;gpg;ssh;
StartupWMClass=Oberlicht
EOF
    update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
    success "App launcher entry created."
fi

# ── GPG + pass setup ──────────────────────────────────────────────────────────
header "pass / GPG setup"

# Check if pass store already initialised
if [[ -f "$HOME/.password-store/.gpg-id" ]]; then
    KEY_IN_USE=$(cat "$HOME/.password-store/.gpg-id")
    success "pass store already initialised (key: ${KEY_IN_USE})"
else
    echo -e "  ${BOLD}pass${NC} stores all passwords GPG-encrypted."
    echo -e "  You need a GPG key first, then we'll initialise the store."
    echo ""

    # ── Step 1: GPG key ────────────────────────────────────────────────────────
    GPG_KEYS=$(gpg --list-secret-keys --keyid-format=LONG 2>/dev/null || true)

    if [[ -z "$GPG_KEYS" ]]; then
        ask "No GPG key found. Create one now? [Y/n]"
        read -rp "  > " REPLY
        if [[ "${REPLY,,}" != "n" ]]; then
            echo ""
            info "Starting GPG key wizard…"
            echo -e "  ${CYAN}Tip:${NC} choose 'RSA and RSA', keysize 4096, no expiry (0)."
            echo -e "  ${CYAN}Tip:${NC} use your real name and email — pass will show them."
            echo ""
            gpg --full-generate-key
            echo ""
        else
            warn "Skipping. Run 'gpg --full-generate-key' and 'pass init <key-id>' manually."
            echo ""
        fi
    fi

    # ── Step 2: pick key and init pass ────────────────────────────────────────
    # Re-read keys after potential creation
    mapfile -t KEY_LINES < <(gpg --list-secret-keys --keyid-format=LONG 2>/dev/null \
        | grep -E "^sec" | grep -oP '[0-9A-F]{16}' || true)

    if [[ ${#KEY_LINES[@]} -eq 0 ]]; then
        warn "No GPG key available. Skipping pass initialisation."
        warn "Run manually: gpg --full-generate-key && pass init <key-id>"
    elif [[ ${#KEY_LINES[@]} -eq 1 ]]; then
        CHOSEN_KEY="${KEY_LINES[0]}"
        # Show which key we picked
        KEY_UID=$(gpg --list-secret-keys --keyid-format=LONG 2>/dev/null \
            | grep -A2 "$CHOSEN_KEY" | grep "uid" | sed 's/.*uid[[:space:]]*//' | head -1)
        info "Using key: ${CHOSEN_KEY} (${KEY_UID})"
        ask "Initialise pass store with this key? [Y/n]"
        read -rp "  > " REPLY
        if [[ "${REPLY,,}" != "n" ]]; then
            pass init "$CHOSEN_KEY"
            success "pass store initialised!"
        fi
    else
        echo -e "  Multiple GPG keys found:"
        echo ""
        gpg --list-secret-keys --keyid-format=LONG 2>/dev/null \
            | grep -E "^(sec|uid)" | sed 's/^/  /'
        echo ""
        ask "Enter the key ID (16-char hex) to use for pass:"
        read -rp "  > " CHOSEN_KEY
        if [[ -n "$CHOSEN_KEY" ]]; then
            pass init "$CHOSEN_KEY"
            success "pass store initialised!"
        fi
    fi
fi

# ── Done ──────────────────────────────────────────────────────────────────────
header "All done"
echo ""

if [[ "$PKG_MANAGER" == "apt" ]]; then
    echo -e "  ${GREEN}▸${NC} Start Oberlicht: ${BOLD}oberlicht${NC}"
    echo -e "  ${GREEN}▸${NC} Or find it in your application menu."
else
    echo -e "  ${GREEN}▸${NC} Build from source, then run: ${BOLD}oberlicht${NC}"
    echo -e "  ${GREEN}▸${NC} ${CYAN}https://github.com/${REPO}#build-from-source${NC}"
fi

if [[ -f "$HOME/.password-store/.gpg-id" ]] && [[ -z "$(ls -A "$HOME/.password-store/" 2>/dev/null | grep -v '.gpg-id')" ]]; then
    echo ""
    echo -e "  ${CYAN}Tip:${NC} Your password store is empty — add your first entry in Oberlicht"
    echo -e "       or with: ${BOLD}pass insert folder/name${NC}"
fi
echo ""
