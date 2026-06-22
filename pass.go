package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/rand"
	"fmt"
	"io"
	"math/big"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
)

// ── Data types ────────────────────────────────────────────────────────────

type PasswordEntry struct {
	Name     string `json:"name"`
	FullPath string `json:"fullPath"`
}

type PasswordField struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type PasswordDetails struct {
	Password string          `json:"password"`
	Fields   []PasswordField `json:"fields"`
	Notes    string          `json:"notes"`
}

type EntryData struct {
	FullPath string          `json:"fullPath"`
	Password string          `json:"password"`
	Fields   []PasswordField `json:"fields"`
	Notes    string          `json:"notes"`
}

type GeneratorOptions struct {
	Length      int  `json:"length"`
	Upper       bool `json:"upper"`
	Lower       bool `json:"lower"`
	Numbers     bool `json:"numbers"`
	Symbols     bool `json:"symbols"`
	NoAmbiguous bool `json:"noAmbiguous"`
}

type SSHKeyPair struct {
	PrivateKey string `json:"privateKey"`
	PublicKey  string `json:"publicKey"`
}

// ── Store helpers ─────────────────────────────────────────────────────────

func storeDir() string {
	if dir := os.Getenv("PASSWORD_STORE_DIR"); dir != "" {
		return dir
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".password-store")
}

// ── Read ──────────────────────────────────────────────────────────────────

func (a *App) ListPasswords() ([]PasswordEntry, error) {
	root := storeDir()
	if _, err := os.Stat(root); os.IsNotExist(err) {
		return []PasswordEntry{}, fmt.Errorf("pass-Tresor nicht gefunden: %s — bitte 'pass init' ausführen", root)
	}
	var entries []PasswordEntry

	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() && info.Name() == ".git" {
			return filepath.SkipDir
		}
		if info.IsDir() || !strings.HasSuffix(info.Name(), ".gpg") {
			return nil
		}
		rel, _ := filepath.Rel(root, path)
		fullPath := strings.TrimSuffix(rel, ".gpg")
		entries = append(entries, PasswordEntry{
			Name:     filepath.Base(fullPath),
			FullPath: fullPath,
		})
		return nil
	})

	return entries, err
}

// MoveEntry moves/renames a pass entry without decrypting it.
func (a *App) MoveEntry(from, to string) error {
	cmd := exec.Command("pass", "mv", "--force", from, to)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("verschieben fehlgeschlagen: %s", string(out))
	}
	return nil
}

func (a *App) GetPassword(fullPath string) (PasswordDetails, error) {
	cmd := exec.Command("pass", "show", fullPath)
	out, err := cmd.Output()
	if err != nil {
		return PasswordDetails{}, fmt.Errorf("pass show fehlgeschlagen: %w", err)
	}
	return parsePassContent(string(out)), nil
}

// GetFolders returns all unique folder paths in the store, sorted.
func (a *App) GetFolders() ([]string, error) {
	root := storeDir()
	seen := map[string]bool{}

	filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil || !info.IsDir() {
			return nil
		}
		if info.Name() == ".git" {
			return filepath.SkipDir
		}
		if path == root {
			return nil
		}
		rel, _ := filepath.Rel(root, path)
		seen[rel] = true
		return nil
	})

	folders := make([]string, 0, len(seen))
	for f := range seen {
		folders = append(folders, f)
	}
	sort.Strings(folders)
	return folders, nil
}

// ── Write ─────────────────────────────────────────────────────────────────

func (a *App) CreateEntry(data EntryData) error {
	content := buildPassContent(data)
	cmd := exec.Command("pass", "insert", "--multiline", "--force", data.FullPath)
	cmd.Stdin = strings.NewReader(content)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("erstellen fehlgeschlagen: %s", string(out))
	}
	return nil
}

func (a *App) UpdateEntry(oldPath string, data EntryData) error {
	content := buildPassContent(data)

	if oldPath != data.FullPath {
		mv := exec.Command("pass", "mv", "--force", oldPath, data.FullPath)
		if out, err := mv.CombinedOutput(); err != nil {
			return fmt.Errorf("umbenennen fehlgeschlagen: %s", string(out))
		}
	}

	cmd := exec.Command("pass", "insert", "--multiline", "--force", data.FullPath)
	cmd.Stdin = strings.NewReader(content)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("speichern fehlgeschlagen: %s", string(out))
	}
	return nil
}

func (a *App) DeleteEntry(fullPath string) error {
	cmd := exec.Command("pass", "rm", "--force", fullPath)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("löschen fehlgeschlagen: %s", string(out))
	}
	return nil
}

// ── Clipboard ─────────────────────────────────────────────────────────────

func (a *App) CopyPassword(fullPath string) error {
	cmd := exec.Command("pass", "show", "--clip", fullPath)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("kopieren fehlgeschlagen: %w", err)
	}
	return nil
}

// ── Generator ─────────────────────────────────────────────────────────────

func (a *App) GeneratePasswordAdvanced(opts GeneratorOptions) (string, error) {
	const ambiguous = "0Ol1I"
	var charsBuf strings.Builder

	filterRunes := func(s string) {
		for _, c := range s {
			if !opts.NoAmbiguous || !strings.ContainsRune(ambiguous, c) {
				charsBuf.WriteRune(c)
			}
		}
	}
	if opts.Upper   { filterRunes("ABCDEFGHIJKLMNOPQRSTUVWXYZ") }
	if opts.Lower   { filterRunes("abcdefghijklmnopqrstuvwxyz") }
	if opts.Numbers { filterRunes("0123456789") }
	if opts.Symbols { charsBuf.WriteString("!@#$%^&*()-_=+[]{}|;:,.<>?") }
	chars := charsBuf.String()

	if chars == "" {
		return "", fmt.Errorf("mindestens eine Zeichenklasse muss ausgewählt sein")
	}

	length := max(opts.Length, 4)

	runes := []rune(chars)
	result := make([]rune, length)
	for i := range result {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(runes))))
		if err != nil {
			return "", err
		}
		result[i] = runes[n.Int64()]
	}
	return string(result), nil
}

func (a *App) GenerateSSHKeyPair(keyType, comment string) (SSHKeyPair, error) {
	tmpDir, err := os.MkdirTemp("", "oberlicht-ssh-*")
	if err != nil {
		return SSHKeyPair{}, err
	}
	defer os.RemoveAll(tmpDir)

	keyFile := filepath.Join(tmpDir, "key")

	args := []string{"-t", keyType, "-f", keyFile, "-N", "", "-C", comment}
	if keyType == "rsa" {
		args = append(args, "-b", "4096")
	}

	if out, err := exec.Command("ssh-keygen", args...).CombinedOutput(); err != nil {
		return SSHKeyPair{}, fmt.Errorf("ssh-keygen fehlgeschlagen: %s", string(out))
	}

	priv, err := os.ReadFile(keyFile)
	if err != nil {
		return SSHKeyPair{}, fmt.Errorf("privaten Schlüssel lesen: %w", err)
	}
	pub, err := os.ReadFile(keyFile + ".pub")
	if err != nil {
		return SSHKeyPair{}, fmt.Errorf("öffentlichen Schlüssel lesen: %w", err)
	}

	return SSHKeyPair{
		PrivateKey: string(priv),
		PublicKey:  strings.TrimSpace(string(pub)),
	}, nil
}

// ── Export ────────────────────────────────────────────────────────────────

func (a *App) ExportMarkdown() (string, error) {
	entries, err := a.ListPasswords()
	if err != nil {
		return "", err
	}

	// build folder → entries map
	type folder struct {
		path    string
		entries []PasswordEntry
	}
	folderMap := map[string]*folder{}
	var folderOrder []string

	for _, e := range entries {
		parts := strings.Split(e.FullPath, "/")
		dir := ""
		if len(parts) > 1 {
			dir = strings.Join(parts[:len(parts)-1], "/")
		}
		if _, ok := folderMap[dir]; !ok {
			folderMap[dir] = &folder{path: dir}
			folderOrder = append(folderOrder, dir)
		}
		folderMap[dir].entries = append(folderMap[dir].entries, e)
	}
	sort.Strings(folderOrder)

	var sb strings.Builder
	sb.WriteString("# Oberlicht — Passwort-Store Übersicht\n\n")
	for _, dir := range folderOrder {
		f := folderMap[dir]
		if dir == "" {
			sb.WriteString("## (Wurzel)\n")
		} else {
			fmt.Fprintf(&sb, "## %s\n", dir)
		}
		for _, e := range f.entries {
			fmt.Fprintf(&sb, "- %s\n", e.Name)
		}
		sb.WriteString("\n")
	}
	return sb.String(), nil
}

func (a *App) ExportCSV() (string, error) {
	entries, err := a.ListPasswords()
	if err != nil {
		return "", err
	}

	var sb strings.Builder
	sb.WriteString("name,path,folder\n")
	for _, e := range entries {
		parts := strings.Split(e.FullPath, "/")
		folder := ""
		if len(parts) > 1 {
			folder = strings.Join(parts[:len(parts)-1], "/")
		}
		fmt.Fprintf(&sb, "%s,%s,%s\n", csvEsc(e.Name), csvEsc(e.FullPath), csvEsc(folder))
	}
	return sb.String(), nil
}

func csvEsc(s string) string {
	if strings.ContainsAny(s, ",\"\n") {
		return `"` + strings.ReplaceAll(s, `"`, `""`) + `"`
	}
	return s
}

// ── Backup / Restore ─────────────────────────────────────────────────────

// BackupStore creates an AES-256 GPG-encrypted tar.gz of the entire pass store.
// tar/gzip is done natively in Go — no external tar binary needed.
func (a *App) BackupStore(destPath, passphrase string) error {
	store := storeDir()

	// Build tar.gz in memory pipe → stream directly into gpg stdin
	pr, pw, err := os.Pipe()
	if err != nil {
		return fmt.Errorf("pipe erstellen: %w", err)
	}

	// Passphrase pipe for gpg --passphrase-fd 3
	ppr, ppw, err := os.Pipe()
	if err != nil {
		pr.Close(); pw.Close()
		return fmt.Errorf("passphrase-pipe erstellen: %w", err)
	}
	go func() { ppw.WriteString(passphrase); ppw.Close() }()

	gpgCmd := exec.Command("gpg", "--symmetric", "--cipher-algo", "AES256",
		"--batch", "--yes", "--passphrase-fd", "3", "--output", destPath)
	gpgCmd.Stdin      = pr
	gpgCmd.ExtraFiles = []*os.File{ppr}
	var gpgErr bytes.Buffer
	gpgCmd.Stderr = &gpgErr

	if err := gpgCmd.Start(); err != nil {
		pr.Close(); pw.Close(); ppr.Close()
		return fmt.Errorf("gpg starten: %w", err)
	}
	ppr.Close() // child inherited it, parent can close

	// Write tar.gz into pw concurrently while gpg reads from pr
	tarErr := make(chan error, 1)
	go func() {
		defer pw.Close()
		gz := gzip.NewWriter(pw)
		tw := tar.NewWriter(gz)
		err := filepath.Walk(store, func(path string, fi os.FileInfo, err error) error {
			if err != nil { return err }
			rel, _ := filepath.Rel(filepath.Dir(store), path)
			hdr, err := tar.FileInfoHeader(fi, "")
			if err != nil { return err }
			hdr.Name = rel
			if err := tw.WriteHeader(hdr); err != nil { return err }
			if fi.IsDir() { return nil }
			f, err := os.Open(path)
			if err != nil { return err }
			defer f.Close()
			_, err = io.Copy(tw, f)
			return err
		})
		if err != nil { tarErr <- err; return }
		if err := tw.Close(); err != nil { tarErr <- err; return }
		tarErr <- gz.Close()
	}()

	tErr := <-tarErr
	pr.Close()
	if wErr := gpgCmd.Wait(); wErr != nil {
		return fmt.Errorf("verschlüsseln fehlgeschlagen (falsches Passwort?): %w\n%s", wErr, gpgErr.String())
	}
	if tErr != nil { return fmt.Errorf("archivieren fehlgeschlagen: %w", tErr) }
	return nil
}

// RestoreStore decrypts a GPG backup and extracts it — no external tar needed.
func (a *App) RestoreStore(srcPath, passphrase string) error {
	store := storeDir()

	ppr, ppw, err := os.Pipe()
	if err != nil { return fmt.Errorf("passphrase-pipe: %w", err) }
	go func() { ppw.WriteString(passphrase); ppw.Close() }()

	gpgCmd := exec.Command("gpg", "--decrypt", "--batch",
		"--passphrase-fd", "3", srcPath)
	gpgCmd.ExtraFiles = []*os.File{ppr}
	var gpgStderr bytes.Buffer
	gpgCmd.Stderr = &gpgStderr

	gpgOut, err := gpgCmd.StdoutPipe()
	if err != nil { ppr.Close(); return err }

	if err := gpgCmd.Start(); err != nil {
		ppr.Close()
		return fmt.Errorf("gpg starten: %w", err)
	}
	ppr.Close()

	// Decompress and extract directly from gpg stdout
	gz, err := gzip.NewReader(gpgOut)
	if err != nil {
		gpgCmd.Wait()
		return fmt.Errorf("gzip öffnen fehlgeschlagen (falsches Passwort?): %w", err)
	}
	tr := tar.NewReader(gz)
	base := filepath.Dir(store)

	for {
		hdr, err := tr.Next()
		if err == io.EOF { break }
		if err != nil { gpgCmd.Wait(); return fmt.Errorf("tar lesen: %w", err) }

		target := filepath.Join(base, filepath.Clean("/"+hdr.Name))
		// Guard against path traversal
		if !strings.HasPrefix(target, base+string(os.PathSeparator)) && target != base {
			continue
		}
		if hdr.Typeflag == tar.TypeDir {
			os.MkdirAll(target, hdr.FileInfo().Mode())
			continue
		}
		os.MkdirAll(filepath.Dir(target), 0700)
		f, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, hdr.FileInfo().Mode())
		if err != nil { gpgCmd.Wait(); return fmt.Errorf("datei schreiben: %w", err) }
		if _, err := io.Copy(f, tr); err != nil {
			f.Close(); gpgCmd.Wait()
			return fmt.Errorf("datei kopieren: %w", err)
		}
		f.Close()
	}

	if err := gpgCmd.Wait(); err != nil {
		return fmt.Errorf("entschlüsseln fehlgeschlagen (falsches Passwort?): %w\n%s", err, gpgStderr.String())
	}
	return nil
}

// ── Helpers ───────────────────────────────────────────────────────────────

func buildPassContent(data EntryData) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "%s\n", data.Password)
	for _, f := range data.Fields {
		if strings.TrimSpace(f.Key) != "" {
			fmt.Fprintf(&sb, "%s: %s\n", f.Key, f.Value)
		}
	}
	if strings.TrimSpace(data.Notes) != "" {
		fmt.Fprintf(&sb, "\n%s\n", strings.TrimSpace(data.Notes))
	}
	return sb.String()
}

func parsePassContent(raw string) PasswordDetails {
	lines := strings.Split(strings.TrimRight(raw, "\n"), "\n")
	details := PasswordDetails{}
	if len(lines) == 0 {
		return details
	}

	details.Password = lines[0]

	var noteLines []string
	inNotes := false
	for _, line := range lines[1:] {
		if inNotes {
			noteLines = append(noteLines, line)
			continue
		}
		if line == "" {
			inNotes = true
			continue
		}
		idx := strings.Index(line, ": ")
		if idx > 0 && !strings.Contains(line[:idx], " ") {
			key := strings.TrimSpace(line[:idx])
			value := strings.TrimSpace(line[idx+2:])
			details.Fields = append(details.Fields, PasswordField{Key: key, Value: value})
		} else {
			// Kein Feld-Format → ab hier Notizblock
			inNotes = true
			noteLines = append(noteLines, line)
		}
	}

	details.Notes = strings.TrimSpace(strings.Join(noteLines, "\n"))
	return details
}
