package main

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type PasswordEntry struct {
	Name     string `json:"name"`
	FullPath string `json:"fullPath"`
}

type PasswordDetails struct {
	Password string            `json:"password"`
	Fields   map[string]string `json:"fields"`
	Notes    string            `json:"notes"`
}

func storeDir() string {
	if dir := os.Getenv("PASSWORD_STORE_DIR"); dir != "" {
		return dir
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".password-store")
}

// ListPasswords reads ~/.password-store and returns all entries without decryption.
func (a *App) ListPasswords() ([]PasswordEntry, error) {
	root := storeDir()
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

// GetPassword decrypts an entry and returns structured content.
func (a *App) GetPassword(fullPath string) (PasswordDetails, error) {
	cmd := exec.Command("pass", "show", fullPath)
	out, err := cmd.Output()
	if err != nil {
		return PasswordDetails{}, fmt.Errorf("pass show fehlgeschlagen: %w", err)
	}

	return parsePassContent(string(out)), nil
}

// CopyPassword copies the first line (the password) to the clipboard via pass.
func (a *App) CopyPassword(fullPath string) error {
	cmd := exec.Command("pass", "show", "--clip", fullPath)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("kopieren fehlgeschlagen: %w", err)
	}
	return nil
}

// parsePassContent splits a pass entry into password, key:value fields and notes.
func parsePassContent(raw string) PasswordDetails {
	scanner := bufio.NewScanner(strings.NewReader(raw))
	details := PasswordDetails{
		Fields: make(map[string]string),
	}

	var noteLines []string
	firstLine := true

	for scanner.Scan() {
		line := scanner.Text()

		if firstLine {
			details.Password = line
			firstLine = false
			continue
		}

		// key: value format (e.g. "username: foo", "url: https://...")
		if idx := strings.Index(line, ": "); idx > 0 {
			key := strings.ToLower(strings.TrimSpace(line[:idx]))
			value := strings.TrimSpace(line[idx+2:])
			details.Fields[key] = value
		} else {
			noteLines = append(noteLines, line)
		}
	}

	details.Notes = strings.TrimSpace(strings.Join(noteLines, "\n"))
	return details
}
