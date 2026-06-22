package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"math"
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
	var cmd *exec.Cmd
	if os.Getenv("WAYLAND_DISPLAY") != "" {
		cmd = exec.Command("ydotool", "type", "--file", "-")
	} else {
		cmd = exec.Command("xdotool", "type", "--clearmodifiers", "--delay", "30", "--file", "-")
	}
	cmd.Stdin = strings.NewReader(text)
	out, err := cmd.CombinedOutput()
	if err != nil {
		name := "xdotool"
		if os.Getenv("WAYLAND_DISPLAY") != "" {
			name = "ydotool"
		}
		return fmt.Errorf("%s type: %w — %s", name, err, strings.TrimSpace(string(out)))
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

// ── TOTP (RFC 6238) ───────────────────────────────────────────────────────

type TOTPResult struct {
	Code      string `json:"code"`
	Remaining int    `json:"remaining"` // seconds until next code
	Period    int    `json:"period"`    // always 30
}

// GetTOTP computes the current TOTP code from a base32 secret (standard Authenticator format).
func (a *App) GetTOTP(secret string) (TOTPResult, error) {
	// Clean up secret: remove spaces, uppercase
	secret = strings.ToUpper(strings.ReplaceAll(secret, " ", ""))
	// Pad to multiple of 8
	if pad := len(secret) % 8; pad != 0 {
		secret += strings.Repeat("=", 8-pad)
	}
	key, err := base32.StdEncoding.DecodeString(secret)
	if err != nil {
		return TOTPResult{}, fmt.Errorf("ungültiger TOTP-Secret: %w", err)
	}

	now := time.Now().Unix()
	period := int64(30)
	counter := now / period
	remaining := int(period - (now % period))

	// HOTP: HMAC-SHA1 of counter
	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, uint64(counter))
	mac := hmac.New(sha1.New, key)
	mac.Write(buf)
	h := mac.Sum(nil)

	// Dynamic truncation
	offset := h[len(h)-1] & 0x0f
	code := (int64(h[offset]&0x7f)<<24 |
		int64(h[offset+1])<<16 |
		int64(h[offset+2])<<8 |
		int64(h[offset+3])) % int64(math.Pow10(6))

	return TOTPResult{
		Code:      fmt.Sprintf("%06d", code),
		Remaining: remaining,
		Period:    30,
	}, nil
}

// ── SSH Terminal ──────────────────────────────────────────────────────────

// OpenSSHTerminal launches the user's terminal emulator with the given SSH command.
func (a *App) OpenSSHTerminal(sshCmd string) error {
	type candidate struct {
		bin  string
		args []string
	}

	// Build candidate list; each launches `sshCmd` in a shell so it stays open after disconnect
	shell := []string{"bash", "-c", sshCmd + "; exec bash"}
	candidates := []candidate{
		{os.Getenv("TERMINAL"), append([]string{"-e"}, shell...)},
		{"kitty", append([]string{"--"}, shell...)},
		{"alacritty", append([]string{"-e"}, shell...)},
		{"foot", append([]string{"--"}, shell...)},
		{"wezterm", append([]string{"start", "--"}, shell...)},
		{"ghostty", append([]string{"-e"}, shell...)},
		{"gnome-terminal", append([]string{"--"}, shell...)},
		{"konsole", append([]string{"-e"}, shell...)},
		{"xfce4-terminal", append([]string{"-e"}, shell...)},
		{"mate-terminal", append([]string{"-e"}, shell...)},
		{"xterm", append([]string{"-e"}, shell...)},
	}

	for _, c := range candidates {
		if c.bin == "" {
			continue
		}
		if _, err := exec.LookPath(c.bin); err != nil {
			continue
		}
		cmd := exec.Command(c.bin, c.args...)
		cmd.Env = os.Environ()
		return cmd.Start() // detached — don't wait
	}
	return fmt.Errorf("kein Terminal-Emulator gefunden (kitty, alacritty, gnome-terminal, konsole, xterm …)")
}

// ClearClipboard overwrites clipboard contents with an empty string.
func (a *App) ClearClipboard() error {
	if os.Getenv("WAYLAND_DISPLAY") != "" {
		if err := exec.Command("wl-copy", "--clear").Run(); err == nil {
			return nil
		}
		return exec.Command("wl-copy", "").Run()
	}
	if err := exec.Command("xclip", "-selection", "clipboard", "-i", "/dev/null").Run(); err == nil {
		return nil
	}
	return exec.Command("xsel", "--clipboard", "--clear").Run()
}
