#!/usr/bin/env bash
# Oberlicht installer — https://github.com/alexander-graf/oberlicht
set -euo pipefail

REPO="alexander-graf/oberlicht"
BIN_NAME="oberlicht"
INSTALL_DIR="$HOME/.local/bin"
DESKTOP_DIR="$HOME/.local/share/applications"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${CYAN}▸${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC} $*"; }
error()   { echo -e "${RED}✗${NC} $*" >&2; }
die()     { error "$*"; exit 1; }
header()  { echo -e "\n${BOLD}$*${NC}"; }

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
header "Detecting system…"

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

success "Detected: ${BOLD}${DISTRO}${NC} | $(${IS_WAYLAND} && echo Wayland || echo X11)"

# Pre-built binaries are only built for Ubuntu 22.04 / Mint.
# Arch and others must build from source.
if [[ "$PKG_MANAGER" != "apt" ]]; then
    warn "Pre-built binaries are only provided for Ubuntu/Mint (built on Ubuntu 22.04)."
    echo ""
    echo -e "  For ${BOLD}${DISTRO}${NC}, please build from source:"
    echo -e "  ${CYAN}https://github.com/${REPO}#build-from-source${NC}"
    echo ""
    read -rp "  Continue anyway and only install runtime dependencies? [y/N] " REPLY
    [[ "${REPLY,,}" == "y" ]] || exit 0
fi

# ── Install runtime dependencies ──────────────────────────────────────────────
header "Installing runtime dependencies…"

install_apt() {
    local pkgs=("$@")
    local missing=()
    for p in "${pkgs[@]}"; do
        dpkg -s "$p" &>/dev/null || missing+=("$p")
    done
    if [[ ${#missing[@]} -gt 0 ]]; then
        info "Installing: ${missing[*]}"
        sudo apt-get update -qq
        sudo apt-get install -y "${missing[@]}"
    else
        success "Already installed: ${pkgs[*]}"
    fi
}

install_pacman() {
    local pkgs=("$@")
    local missing=()
    for p in "${pkgs[@]}"; do
        pacman -Qi "$p" &>/dev/null || missing+=("$p")
    done
    [[ ${#missing[@]} -gt 0 ]] && sudo pacman -S --noconfirm "${missing[@]}"
}

install_dnf() {
    sudo dnf install -y "$@"
}

case "$PKG_MANAGER" in
    apt)
        install_apt pass gpg xdotool xclip openssh-client
        if $IS_WAYLAND; then
            install_apt wl-clipboard || warn "wl-clipboard not available — clipboard features limited"
        fi
        ;;
    pacman)
        install_pacman pass gnupg xdotool xclip openssh
        $IS_WAYLAND && install_pacman wl-clipboard
        ;;
    dnf)
        install_dnf pass gnupg2 xdotool xclip openssh
        $IS_WAYLAND && install_dnf wl-clipboard
        ;;
    zypper)
        sudo zypper install -y password-store gpg2 xdotool xclip openssh
        $IS_WAYLAND && sudo zypper install -y wl-clipboard
        ;;
esac

success "Runtime dependencies ready."

# ── Download binary (apt/Mint/Ubuntu only) ────────────────────────────────────
if [[ "$PKG_MANAGER" == "apt" ]]; then
    header "Downloading Oberlicht…"

    if ! command -v curl &>/dev/null && ! command -v wget &>/dev/null; then
        sudo apt-get install -y curl
    fi

    # Fetch latest release download URL
    RELEASE_URL=""
    if command -v curl &>/dev/null; then
        RELEASE_URL=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
            | grep "browser_download_url" \
            | grep "linux-amd64.tar.gz" \
            | head -1 \
            | cut -d'"' -f4)
    else
        RELEASE_URL=$(wget -qO- "https://api.github.com/repos/${REPO}/releases/latest" \
            | grep "browser_download_url" \
            | grep "linux-amd64.tar.gz" \
            | head -1 \
            | cut -d'"' -f4)
    fi

    if [[ -z "$RELEASE_URL" ]]; then
        die "Could not find a release binary. Check https://github.com/${REPO}/releases"
    fi

    info "Downloading: $RELEASE_URL"
    TMPDIR=$(mktemp -d)
    trap 'rm -rf "$TMPDIR"' EXIT

    if command -v curl &>/dev/null; then
        curl -fsSL --progress-bar "$RELEASE_URL" -o "$TMPDIR/oberlicht.tar.gz"
    else
        wget -q --show-progress "$RELEASE_URL" -O "$TMPDIR/oberlicht.tar.gz"
    fi

    tar xzf "$TMPDIR/oberlicht.tar.gz" -C "$TMPDIR"
    success "Downloaded."

    # ── Install binary ─────────────────────────────────────────────────────────
    header "Installing binary…"
    mkdir -p "$INSTALL_DIR"
    install -Dm755 "$TMPDIR/$BIN_NAME" "$INSTALL_DIR/$BIN_NAME"
    success "Installed to $INSTALL_DIR/$BIN_NAME"

    # ── Install icon ───────────────────────────────────────────────────────────
    ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"
    mkdir -p "$ICON_DIR"
    if [[ -f "$TMPDIR/oberlicht.png" ]]; then
        cp "$TMPDIR/oberlicht.png" "$ICON_DIR/oberlicht.png"
        gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
        success "Icon installed."
    fi

    # ── PATH ───────────────────────────────────────────────────────────────────
    SHELL_RC=""
    if [[ -f "$HOME/.bashrc" ]]; then SHELL_RC="$HOME/.bashrc"
    elif [[ -f "$HOME/.zshrc" ]]; then SHELL_RC="$HOME/.zshrc"
    fi

    if [[ -n "$SHELL_RC" ]] && ! grep -q "$INSTALL_DIR" "$SHELL_RC" 2>/dev/null; then
        echo "" >> "$SHELL_RC"
        echo "export PATH=\"\$PATH:$INSTALL_DIR\"" >> "$SHELL_RC"
        warn "Added $INSTALL_DIR to PATH in $SHELL_RC"
        warn "Run: source $SHELL_RC  (or open a new terminal)"
    fi

    # ── Desktop entry ──────────────────────────────────────────────────────────
    header "Creating app launcher entry…"
    mkdir -p "$DESKTOP_DIR"
    cat > "$DESKTOP_DIR/oberlicht.desktop" << EOF
[Desktop Entry]
Name=Oberlicht
Comment=pass Password Manager Frontend
Exec=$INSTALL_DIR/oberlicht
Icon=$HOME/.local/share/icons/hicolor/512x512/apps/oberlicht.png
Type=Application
Categories=Utility;Security;
Keywords=password;pass;gpg;ssh;
StartupWMClass=Oberlicht
EOF
    update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
    success "App launcher entry created."
fi

# ── pass store setup hint ─────────────────────────────────────────────────────
header "Done!"
echo ""

if ! command -v pass &>/dev/null || [[ ! -d "$HOME/.password-store" ]]; then
    echo -e "${YELLOW}First-time setup:${NC} you need a GPG key and a pass store."
    echo ""
    echo -e "  ${CYAN}gpg --full-generate-key${NC}          # create a GPG key"
    echo -e "  ${CYAN}gpg --list-secret-keys${NC}           # note your key ID"
    echo -e "  ${CYAN}pass init <your-key-id>${NC}          # initialise the store"
    echo ""
fi

if [[ "$PKG_MANAGER" == "apt" ]]; then
    echo -e "  Start with: ${BOLD}oberlicht${NC}"
    echo -e "  Or find it in your app launcher."
else
    echo -e "  Build from source and then run: ${BOLD}oberlicht${NC}"
    echo -e "  See: ${CYAN}https://github.com/${REPO}#build-from-source${NC}"
fi
echo ""
