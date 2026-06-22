package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx context.Context
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) OpenURL(url string) {
	runtime.BrowserOpenURL(a.ctx, url)
}

func (a *App) ShowOpenDialog(title string) (string, error) {
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: title,
		Filters: []runtime.FileFilter{
			{DisplayName: "Oberlicht Backup (*.gpg)", Pattern: "*.gpg"},
			{DisplayName: "Alle Dateien", Pattern: "*"},
		},
	})
}

func (a *App) ShowSaveDialog(defaultName string) (string, error) {
	return runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Datei speichern",
		DefaultFilename: defaultName,
	})
}

func (a *App) SaveTextFile(path, content string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(content), 0600)
}

func (a *App) AppendToAuthorizedKeys(publicKey string) error {
	home, _ := os.UserHomeDir()
	sshDir := filepath.Join(home, ".ssh")
	if err := os.MkdirAll(sshDir, 0700); err != nil {
		return err
	}
	authKeysPath := filepath.Join(sshDir, "authorized_keys")
	trimmed := strings.TrimSpace(publicKey)
	if content, err := os.ReadFile(authKeysPath); err == nil {
		if strings.Contains(string(content), trimmed) {
			return nil // bereits eingetragen
		}
	}
	f, err := os.OpenFile(authKeysPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = fmt.Fprintf(f, "\n%s\n", trimmed)
	return err
}

func (a *App) GetHomeDir() (string, error) {
	return os.UserHomeDir()
}

// GetClipboard reads from the specified clipboard.
// selection: "clipboard" (Ctrl+C) or "primary" (mouse selection)
func (a *App) GetClipboard(selection string) (string, error) {
	if selection != "clipboard" && selection != "primary" {
		return "", fmt.Errorf("ungültige Clipboard-Auswahl: %s", selection)
	}
	// Wayland bevorzugen wenn verfügbar
	if os.Getenv("WAYLAND_DISPLAY") != "" {
		args := []string{"--no-newline"}
		if selection == "primary" {
			args = append([]string{"--primary"}, args...)
		}
		if out, err := exec.Command("wl-paste", args...).Output(); err == nil {
			return string(out), nil
		}
	}
	// X11 Fallback: xclip
	if out, err := exec.Command("xclip", "-o", "-selection", selection).Output(); err == nil {
		return string(out), nil
	}
	// X11 Fallback: xsel
	sel := "--clipboard"
	if selection == "primary" {
		sel = "--primary"
	}
	out, err := exec.Command("xsel", sel, "--output").Output()
	if err != nil {
		return "", fmt.Errorf("kein Clipboard-Tool verfügbar (wl-paste / xclip / xsel)")
	}
	return string(out), nil
}

// ── Keyboard input helpers ────────────────────────────────────────────────

func xdoType(text string) error {
	if os.Getenv("WAYLAND_DISPLAY") != "" {
		out, err := exec.Command("ydotool", "type", "--", text).CombinedOutput()
		if err != nil {
			return fmt.Errorf("ydotool type: %w — %s", err, strings.TrimSpace(string(out)))
		}
		return nil
	}
	out, err := exec.Command("xdotool", "type", "--clearmodifiers", "--delay", "30", "--", text).CombinedOutput()
	if err != nil {
		return fmt.Errorf("xdotool type: %w — %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

func xdoKey(key string) error {
	if os.Getenv("WAYLAND_DISPLAY") != "" {
		codes := map[string][2]string{"Tab": {"15:1", "15:0"}, "Return": {"28:1", "28:0"}}
		c, ok := codes[key]
		if !ok {
			return fmt.Errorf("unbekannter Key: %s", key)
		}
		out, err := exec.Command("ydotool", "key", c[0], c[1]).CombinedOutput()
		if err != nil {
			return fmt.Errorf("ydotool key %s: %w — %s", key, err, strings.TrimSpace(string(out)))
		}
		return nil
	}
	out, err := exec.Command("xdotool", "key", key).CombinedOutput()
	if err != nil {
		return fmt.Errorf("xdotool key %s: %w — %s", key, err, strings.TrimSpace(string(out)))
	}
	return nil
}

// AutoFill types [username] Tab [password] into the focused window.
func (a *App) AutoFill(username, password string) error {
	if username != "" {
		if err := xdoType(username); err != nil { return err }
		if err := xdoKey("Tab"); err != nil { return err }
		time.Sleep(80 * time.Millisecond)
	}
	return xdoType(password)
}

// AutoFillSSH types an SSH command, Enter, waits pwDelayMs ms, then password + Enter.
func (a *App) AutoFillSSH(sshCmd, password string, pwDelayMs int) error {
	if err := xdoType(sshCmd); err != nil { return err }
	if err := xdoKey("Return"); err != nil { return err }
	if pwDelayMs > 0 {
		time.Sleep(time.Duration(pwDelayMs) * time.Millisecond)
	}
	if err := xdoType(password); err != nil { return err }
	return xdoKey("Return")
}

// AutoFillCmd types a custom command, Enter, waits pwDelayMs ms, then password + Enter.
func (a *App) AutoFillCmd(cmd, password string, pwDelayMs int) error {
	if err := xdoType(cmd); err != nil { return err }
	if err := xdoKey("Return"); err != nil { return err }
	if pwDelayMs > 0 {
		time.Sleep(time.Duration(pwDelayMs) * time.Millisecond)
	}
	if err := xdoType(password); err != nil { return err }
	return xdoKey("Return")
}

// ExecuteMacro types each command + Enter with stepDelayMs pause between steps.
// Commands may contain {password} which is replaced before typing.
func (a *App) ExecuteMacro(commands []string, password string, stepDelayMs int) error {
	for i, cmd := range commands {
		resolved := strings.ReplaceAll(cmd, "{password}", password)
		if err := xdoType(resolved); err != nil {
			return fmt.Errorf("Schritt %d: %w", i+1, err)
		}
		if err := xdoKey("Return"); err != nil {
			return fmt.Errorf("Schritt %d Enter: %w", i+1, err)
		}
		if i < len(commands)-1 && stepDelayMs > 0 {
			time.Sleep(time.Duration(stepDelayMs) * time.Millisecond)
		}
	}
	return nil
}

// GetSSHFingerprint returns the SHA256 fingerprint of a public key.
func (a *App) GetSSHFingerprint(publicKey string) (string, error) {
	tmp, err := os.CreateTemp("", "obl-fp-*.pub")
	if err != nil { return "", err }
	defer os.Remove(tmp.Name())
	if _, err := tmp.WriteString(strings.TrimSpace(publicKey) + "\n"); err != nil { return "", err }
	tmp.Close()
	out, err := exec.Command("ssh-keygen", "-lf", tmp.Name()).Output()
	if err != nil { return "", fmt.Errorf("fingerprint: %w", err) }
	return strings.TrimSpace(string(out)), nil
}

// CheckDependencies checks which required/optional tools are available on the system.
type DepStatus struct {
	Name        string `json:"name"`
	Available   bool   `json:"available"`
	Required    bool   `json:"required"`
	Description string `json:"description"`
}

func (a *App) CheckDependencies() []DepStatus {
	isWayland := os.Getenv("WAYLAND_DISPLAY") != ""

	check := func(cmd string) bool {
		_, err := exec.LookPath(cmd)
		return err == nil
	}

	deps := []DepStatus{
		{Name: "pass",   Required: true,  Available: check("pass"),   Description: "Passwort-Manager (Kernfunktion)"},
		{Name: "gpg",    Required: true,  Available: check("gpg"),    Description: "GPG-Verschlüsselung für pass"},
		{Name: "tar",    Required: true,  Available: check("tar"),    Description: "Archivierung für Backup-Funktion"},
		{Name: "xdotool", Required: false, Available: check("xdotool"), Description: "Tastatureingabe (Auto-Ausfüllen) — X11"},
	}

	if isWayland {
		deps = append(deps, DepStatus{Name: "ydotool", Required: false, Available: check("ydotool"), Description: "Tastatureingabe (Auto-Ausfüllen) — Wayland"})
		deps = append(deps, DepStatus{Name: "wl-clipboard", Required: false, Available: check("wl-paste"), Description: "Zwischenablage — Wayland (wl-paste / wl-copy)"})
	} else {
		deps = append(deps, DepStatus{Name: "xclip", Required: false, Available: check("xclip"), Description: "Zwischenablage — X11 (bevorzugt)"})
		deps = append(deps, DepStatus{Name: "xsel",  Required: false, Available: check("xsel"),  Description: "Zwischenablage — X11 (Fallback)"})
	}

	deps = append(deps, DepStatus{Name: "ssh-keygen", Required: false, Available: check("ssh-keygen"), Description: "SSH-Schlüsselpaar generieren"})

	return deps
}
