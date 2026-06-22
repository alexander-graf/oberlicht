# Oberlicht

**Ein modernes GUI-Frontend für den Linux-Passwortmanager `pass`.**

> 🇬🇧 [English version → README.md](README.md)

Gebaut mit [Go](https://go.dev/) + [Wails v2](https://wails.io/) (WebKit2GTK). Ein einziges natives Binary — kein Electron, keine Cloud. Deine Passwörter bleiben verschlüsselt auf deinem Rechner.

---

## Features

### Passwortverwaltung
- **Baumansicht** des gesamten `~/.password-store/` mit Ordnern, aufklappbaren Gruppen und Drag & Drop
- **Live-Suche** mit Eintrags-Zähler (`3 von 42 gefunden`)
- **Filter-Leiste** — filtern nach Typ (Web / SSH / Makro) und nach Ordner; Typ-Badges erscheinen automatisch beim ersten Öffnen eines Eintrags
- **Detail-Ansicht** — Passwort anzeigen/verbergen, Ein-Klick-Kopieren, Felder-Tabelle mit URL-Erkennung, Notizen
- **Erstellen, Bearbeiten, Löschen** von Einträgen über ein sauberes Formular-Dialog
- **Tastatursteuerung** — `↑`/`↓` durch die Liste, `Enter` öffnet, `Ctrl+F` Suche fokussieren, `Ctrl+N` neuer Eintrag, `Escape` schließt/leert

### Auto-Ausfüllen (xdotool / ydotool)
Auto-Ausfüllen tippt in das Fenster, das du während des Countdowns fokussierst — kein Browser-Plugin nötig.

| Modus | Ablauf | Erkannt wenn |
|-------|--------|--------------|
| **Web** | Benutzername `Tab` Passwort | Feld `login:`/`email:` vorhanden |
| **SSH** | `ssh [user@]host` `Enter` → warten → Passwort `Enter` | Feld `host:`/`server:` vorhanden |
| **Makro** | Mehrere Befehle nacheinander | `befehl:`-Felder vorhanden |
| **Befehl** | Beliebige Befehls-Vorlage | Feld `autofill-cmd:` |

- Auto-Ausfüllen-Einstellung wird **im Pass-Eintrag selbst gespeichert** (mit verschlüsselt)
- Verzögerungen (`autofill-delay`, `autofill-pw-delay`) ebenfalls per Eintrag einstellbar
- `{password}` als Platzhalter in Makros und Befehlen
- Einstellbarer Countdown (Standard 2 Sek.) — Zeit, um ins Zielfenster zu klicken
- Wayland-Unterstützung via `ydotool`, X11 via `xdotool`

#### Makro-Beispiel
```
# ~/.password-store/deploy/staging.gpg
mein-passphrase
befehl: ssh deploy@staging.example.com
befehl: {password}
befehl: sudo systemctl restart app
befehl: {password}
autofill: true
autofill-delay: 3
autofill-pw-delay: 6
```

### SSH-Unterstützung
- **Auto-Erkennung** — hat ein Eintrag ein `host:`- oder `server:`-Feld, wird automatisch SSH-Modus verwendet
- **Fingerprint-Anzeige** — live generiert via `ssh-keygen -lf`, wenn ein `public-key:`-Feld vorhanden ist
- **SSH-Schlüsselpaar-Generator** im Generator-Tab (Ed25519 / RSA 4096 / ECDSA 521)
- Ein-Klick-Eintrag in `~/.ssh/authorized_keys` (mit Duplikat-Prüfung)

### Passwort-Generator
- Einstellbare Länge (8–128), Zeichensätze (Groß, Klein, Zahlen, Sonderzeichen), Mehrdeutige-Zeichen-Filter
- Live-Vorschau mit Stärke-Indikator
- Direkt kopieren oder als neuen Pass-Eintrag speichern

### Verschlüsseltes Backup / Wiederherstellen
- Sichert den gesamten `~/.password-store/` als `.tar.gz.gpg`
- AES-256 symmetrische GPG-Verschlüsselung mit frei wählbarem Passwort
- Streaming `tar | gpg` Pipeline — kein unverschlüsselter Temp-Schritt auf der Festplatte
- Wiederherstellen entschlüsselt und entpackt in einem Schritt

### Zwischenablage-Panel
- Liest gleichzeitig aus `CLIPBOARD` (Strg+C) und `PRIMARY` (Mausauswahl)
- Letzte Kopier-Aktionen mit Zeitstempel
- Wayland: `wl-paste` / X11: `xclip`, `xsel` (automatische Fallback-Kette)

### Export
- **Markdown** — formatierte Tabelle pro Eintrag, zum Ausdrucken oder Archivieren
- **CSV** — Import in Tabellenkalkulationen oder andere Passwort-Manager
- Einzeleintrag-Export über die Aktionsleiste in der Detail-Ansicht
- Speichern-Dialog für den Zielort

### Themes
20 eingebaute Themes — dunkel und hell:

| Dunkel | Hell |
|--------|------|
| Nachtblau, Mitternacht, Dracula, Nord | Papier, Sandstein, GitHub Light |
| Gruvbox, Tokyo Night, Catppuccin Mocha | Solarized Light, Catppuccin Latte |
| One Dark, Solarized Dark, Matrix | |
| Bernstein, Cyberpunk, Sonnenuntergang, Wald, Lavendel | |

### System-Check
Beim Start prüft Oberlicht alle benötigten und optionalen Tools und zeigt bei Fehlendem einen Dialog. Der System-Tab zeigt die vollständige Abhängigkeitstabelle jederzeit an.

---

## Voraussetzungen

### Laufzeit-Abhängigkeiten

| Tool | Pflicht | Zweck |
|------|---------|-------|
| `pass` | ✅ | Passwort-Speicher |
| `gpg` | ✅ | Ver- und Entschlüsselung |
| `tar` | ✅ | Backup-Archiv |
| `xdotool` | optional (X11) | Auto-Ausfüllen Tastatureingabe |
| `ydotool` | optional (Wayland) | Auto-Ausfüllen Tastatureingabe |
| `xclip` oder `xsel` | optional (X11) | Zwischenablage-Panel |
| `wl-clipboard` | optional (Wayland) | Zwischenablage-Panel (`wl-paste`) |
| `ssh-keygen` | optional | Fingerprint-Anzeige, Schlüsselpaar-Generator |

### Installation nach Distribution

**Arch Linux / Manjaro**
```bash
sudo pacman -S pass gnupg tar xdotool xclip openssh
# Wayland (ydotool ist im AUR):
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

> **Wayland-Hinweis:** `ydotool` benötigt seinen Daemon `ydotoold`:
> ```bash
> systemctl --user enable --now ydotool
> ```

### Pass initialisieren (einmalig)
```bash
gpg --full-generate-key          # GPG-Schlüssel erstellen falls noch keiner vorhanden
gpg --list-secret-keys           # Schlüssel-ID notieren
pass init <deine-gpg-schluessel-id>   # Passwort-Speicher initialisieren
```

---

## Installation

### Binary herunterladen (empfohlen)
Das aktuelle Binary von [Releases](https://github.com/alexander-graf/oberlicht/releases) herunterladen und installieren:

```bash
install -Dm755 oberlicht ~/.local/bin/oberlicht
```

Desktop-Eintrag erstellen, damit die App im Launcher erscheint:
```bash
cat > ~/.local/share/applications/oberlicht.desktop <<EOF
[Desktop Entry]
Name=Oberlicht
Comment=pass Passwort-Manager Frontend
Exec=oberlicht
Icon=oberlicht
Type=Application
Categories=Utility;Security;
Keywords=password;pass;gpg;ssh;
StartupWMClass=Oberlicht
EOF
```

### Aus dem Quellcode bauen
```bash
# 1. Go 1.21+ installieren
#    https://go.dev/dl/

# 2. Wails CLI installieren
go install github.com/wailsapp/wails/v2/cmd/wails@latest

# 3. WebKit2GTK installieren
#    Arch:   sudo pacman -S webkit2gtk-4.1
#    Ubuntu: sudo apt install libwebkit2gtk-4.1-dev
#    Fedora: sudo dnf install webkit2gtk4.1-devel

# 4. Klonen und bauen
git clone https://github.com/alexander-graf/oberlicht.git
cd oberlicht
wails build -tags webkit2_41
```

Das Binary liegt danach unter `build/bin/oberlicht`.

> Falls dein System `webkit2gtk-4.0` statt `4.1` hat, `-tags webkit2_41` weglassen.

---

## Bedienung

### Eintrags-Format (pass)
Oberlicht folgt dem Standard-`pass`-Format:

```
erste Zeile ist immer das Passwort
login: benutzer@example.com
url: https://example.com
beliebiger-schluessel: beliebiger wert

Alles nach einer Leerzeile sind Notizen.
Notizen können beliebig viele Zeilen haben.
```

### Auto-Ausfüllen-Felder (vom Programm gespeichert)
Diese Felder werden von Oberlicht geschrieben, wenn du Auto-Ausfüllen für einen Eintrag aktivierst. Sie sind wie alles andere in pass verschlüsselt.

| Feld | Werte | Bedeutung |
|------|-------|-----------|
| `autofill` | `true` | Auto-Ausfüllen aktiviert |
| `autofill-type` | `web`, `ssh`, `macro`, `cmd` | Modus manuell festlegen |
| `autofill-delay` | Sekunden (1–30) | Pause bevor das Tippen beginnt |
| `autofill-pw-delay` | Sekunden (1–30) | Warten auf Passwort-Prompt (SSH/Makro) |
| `autofill-cmd` | Befehls-Vorlage | Vorlage für `cmd`-Modus |
| `befehl` | Befehlszeile | Ein Makro-Schritt (mehrfach für Sequenz) |

### SSH-Eintrag Beispiel
```
mein-geheimes-passwort
host: meinserver.example.com
login: meinbenutzer
port: 2222
autofill: true
autofill-delay: 2
autofill-pw-delay: 5
```

### Makro-Eintrag Beispiel
```
sudo-passwort
befehl: cd /opt/meine-app
befehl: git pull
befehl: sudo systemctl restart meine-app
befehl: {password}
autofill: true
autofill-delay: 3
autofill-pw-delay: 4
```

---

## Architektur

```
oberlicht/
├── main.go          # Wails-Einstiegspunkt, Fenster-Optionen
├── app.go           # Go-Backend-Methoden (AutoFill, Zwischenablage, Dialoge…)
├── pass.go          # Pass-Store-Operationen (Liste, Lesen, Schreiben, Backup)
├── frontend/
│   └── src/
│       ├── main.js      # Gesamte UI (Vanilla JS, kein Framework)
│       ├── style.css    # Alle Styles + 20 Theme-Variablen
│       └── themes.js    # Theme-Definitionen
└── build/
    └── appicon.png  # App-Icon (512×512)
```

- **Kein Frontend-Framework** — Vanilla JS + Vite für das Bundling
- **Einzelnes Binary** — Frontend-Assets per `//go:embed` eingebettet
- **Kein Netzwerk** — alle Kommunikation läuft lokal Go ↔ WebKit IPC

---

## Lizenz

MIT — siehe [LICENSE](LICENSE).
