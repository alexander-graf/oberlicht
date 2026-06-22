# Oberlicht

**A modern GUI frontend for the Linux `pass` password manager.**

> 🇩🇪 [Deutsche Version → README.de.md](README.de.md)

Built with [Go](https://go.dev/) + [Wails v2](https://wails.io/) (WebKit2GTK). A single native binary, no Electron, no cloud — your passwords stay encrypted on your machine.

---

## Features

### Password Management
- **Tree view** of your entire `~/.password-store/` with folders, collapsible groups and drag & drop reorganization
- **Live search** with entry counter (`3 of 42 found`)
- **Smart filter bar** — filter by entry type (Web / SSH / Macro) and by top-level folder; type badges appear automatically as you open entries
- **Full detail view** — password reveal toggle, one-click copy, field table with URL detection, notes
- **Create, edit, delete** entries with a clean form dialog
- **Keyboard navigation** — `↑`/`↓` through the list, `Enter` to open, `Ctrl+F` focus search, `Ctrl+N` new entry, `Escape` to close/clear

### AutoFill (xdotool / ydotool)
AutoFill types into whatever window you focus during the countdown — no browser plugin needed.

| Mode | How it works | Triggered by |
|------|-------------|--------------|
| **Web** | username `Tab` password | `login:`/`email:` field present |
| **SSH** | `ssh [user@]host` `Enter` → wait → password `Enter` | `host:`/`server:` field |
| **Macro** | multiple commands typed sequentially | `befehl:` fields |
| **Custom** | arbitrary command template | `autofill-cmd:` field |

- Per-entry AutoFill toggle stored **inside the pass entry** (encrypted with everything else)
- Per-entry delay settings (`autofill-delay`, `autofill-pw-delay`) also stored in the entry
- `{password}` placeholder works in macros and custom commands
- Configurable countdown (default 2 s) — time to click into the target window
- Wayland support via `ydotool`, X11 via `xdotool`

#### Macro example
```
# ~/.password-store/deploy/staging.gpg
my-passphrase
befehl: ssh deploy@staging.example.com
befehl: {password}
befehl: sudo systemctl restart app
befehl: {password}
autofill: true
autofill-delay: 3
autofill-pw-delay: 6
```

### SSH Support
- **Auto-detection** — if an entry has a `host:` or `server:` field, SSH mode is used automatically
- **Fingerprint display** — live-generated via `ssh-keygen -lf` when a `public-key:` field is present
- **SSH keypair generator** in the Generator tab (Ed25519 / RSA 4096 / ECDSA 521)
- One-click append to `~/.ssh/authorized_keys` (duplicate-safe)

### Password Generator
- Configurable length (8–128), character sets (upper, lower, numbers, symbols), no-ambiguous mode
- Live preview with strength indicator
- Copy directly or save to a new pass entry

### Encrypted Backup / Restore
- Backs up the entire `~/.password-store/` tree as a `.tar.gz.gpg`
- AES-256 symmetric GPG encryption with a passphrase you choose
- Streaming `tar | gpg` pipeline — no unencrypted temp files written to disk
- Restore decrypts and extracts in one step

### Clipboard Panel
- Reads from both `CLIPBOARD` (Ctrl+C) and `PRIMARY` (mouse selection) — simultaneously displayed
- Recent copies list with timestamps
- Wayland: `wl-paste` / X11: `xclip`, `xsel` (automatic fallback chain)

### Export
- **Markdown** — formatted table per entry, suitable for printing or archiving
- **CSV** — import into spreadsheets or other password managers
- Single-entry export via the detail view action button
- Save dialog for choosing destination

### Themes
20 built-in themes — dark and light:

| Dark | Light |
|------|-------|
| Nachtblau, Mitternacht, Dracula, Nord | Papier, Sandstein, GitHub Light |
| Gruvbox, Tokyo Night, Catppuccin Mocha | Solarized Light, Catppuccin Latte |
| One Dark, Solarized Dark, Matrix | |
| Bernstein, Cyberpunk, Sonnenuntergang, Wald, Lavendel | |

### System Check
On startup Oberlicht checks for required and optional tools and shows a dialog for anything missing. The System tab shows the full dependency table at any time.

---

## Requirements

### Runtime dependencies

| Tool | Required | Purpose |
|------|----------|---------|
| `pass` | ✅ | Password store |
| `gpg` | ✅ | Encryption / decryption |
| `tar` | ✅ | Backup archive |
| `xdotool` | optional (X11) | AutoFill keyboard input |
| `ydotool` | optional (Wayland) | AutoFill keyboard input |
| `xclip` or `xsel` | optional (X11) | Clipboard panel |
| `wl-clipboard` | optional (Wayland) | Clipboard panel (`wl-paste`) |
| `ssh-keygen` | optional | Fingerprint display, keypair generation |

### Install dependencies by distribution

**Arch Linux / Manjaro**
```bash
sudo pacman -S pass gnupg tar xdotool xclip openssh
# Wayland (ydotool is in AUR):
yay -S ydotool
sudo pacman -S wl-clipboard
```

**Debian / Ubuntu / Linux Mint**
```bash
sudo apt install pass gpg tar xdotool xclip openssh-client
# Wayland:
sudo apt install ydotool wl-clipboard
```

**Fedora**
```bash
sudo dnf install pass gnupg2 tar xdotool xclip openssh
# Wayland:
sudo dnf install ydotool wl-clipboard
```

**openSUSE**
```bash
sudo zypper install password-store gpg2 tar xdotool xclip openssh
# Wayland:
sudo zypper install ydotool wl-clipboard
```

> **Wayland note:** `ydotool` requires its daemon `ydotoold` to be running:
> ```bash
> systemctl --user enable --now ydotool
> ```

### Initialize pass (first time)
```bash
gpg --full-generate-key          # create a GPG key if you don't have one
gpg --list-secret-keys           # note your key ID
pass init <your-gpg-key-id>      # initialise the store
```

---

## Installation

### Download binary (recommended)
Grab the latest binary from [Releases](https://github.com/alexander-graf/oberlicht/releases) and install it:

```bash
install -Dm755 oberlicht ~/.local/bin/oberlicht
```

Create a `.desktop` entry so it appears in your app launcher:
```bash
cat > ~/.local/share/applications/oberlicht.desktop <<EOF
[Desktop Entry]
Name=Oberlicht
Comment=pass Password Manager Frontend
Exec=oberlicht
Icon=oberlicht
Type=Application
Categories=Utility;Security;
StartupWMClass=Oberlicht
EOF
```

### Build from source
```bash
# 1. Install Go 1.21+
#    https://go.dev/dl/

# 2. Install Wails CLI
go install github.com/wailsapp/wails/v2/cmd/wails@latest

# 3. Install WebKit2GTK
#    Arch:   sudo pacman -S webkit2gtk-4.1
#    Ubuntu: sudo apt install libwebkit2gtk-4.1-dev
#    Fedora: sudo dnf install webkit2gtk4.1-devel

# 4. Clone and build
git clone https://github.com/alexander-graf/oberlicht.git
cd oberlicht
wails build -tags webkit2_41
```

The binary is at `build/bin/oberlicht`.

> If your system has `webkit2gtk-4.0` instead of `4.1`, omit the `-tags webkit2_41` flag.

---

## Usage

### Entry format (pass)
Oberlicht follows the standard `pass` file format:

```
first line is always the password
login: myuser@example.com
url: https://example.com
any-key: any value

Everything after a blank line is treated as notes.
Notes can span multiple lines freely.
```

### AutoFill fields (stored in the entry)
These fields are written by Oberlicht when you enable AutoFill for an entry. They are encrypted like everything else in pass.

| Field | Values | Meaning |
|-------|--------|---------|
| `autofill` | `true` | AutoFill enabled |
| `autofill-type` | `web`, `ssh`, `macro`, `cmd` | Override auto-detection |
| `autofill-delay` | seconds (1–30) | Pause before typing begins |
| `autofill-pw-delay` | seconds (1–30) | Wait for password prompt (SSH/macro) |
| `autofill-cmd` | command string | Template for `cmd` mode |
| `befehl` | command string | One macro step (repeat for multiple) |

### SSH entry example
```
mysecretpassword
host: myserver.example.com
login: myuser
port: 2222
autofill: true
autofill-delay: 2
autofill-pw-delay: 5
```

### Macro entry example
```
sudo-password
befehl: cd /opt/myapp
befehl: git pull
befehl: sudo systemctl restart myapp
befehl: {password}
autofill: true
autofill-delay: 3
autofill-pw-delay: 4
```

---

## Architecture

```
oberlicht/
├── main.go          # Wails entry point, window options
├── app.go           # All Go backend methods (AutoFill, clipboard, dialogs…)
├── pass.go          # pass store operations (list, read, write, backup)
├── frontend/
│   └── src/
│       ├── main.js      # Full UI (vanilla JS, no framework)
│       ├── style.css    # All styles + 20 theme variables
│       └── themes.js    # Theme definitions
└── build/
    └── appicon.png  # App icon (512×512)
```

- **No frontend framework** — vanilla JS + Vite for bundling
- **Single binary** — frontend assets embedded via `//go:embed`
- **No network** — all communication is local Go ↔ WebKit IPC

---

## License

MIT — see [LICENSE](LICENSE).
