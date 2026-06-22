package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

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

// ShowSaveDialog opens a native save dialog and returns the chosen path.
func (a *App) ShowSaveDialog(defaultName string) (string, error) {
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Datei speichern",
		DefaultFilename: defaultName,
	})
	return path, err
}

// SaveTextFile writes content to path with 0600 permissions.
func (a *App) SaveTextFile(path, content string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(content), 0600)
}

// AppendToAuthorizedKeys appends a public key to ~/.ssh/authorized_keys.
func (a *App) AppendToAuthorizedKeys(publicKey string) error {
	home, _ := os.UserHomeDir()
	sshDir  := filepath.Join(home, ".ssh")
	if err := os.MkdirAll(sshDir, 0700); err != nil {
		return err
	}
	authKeys := filepath.Join(sshDir, "authorized_keys")
	f, err := os.OpenFile(authKeys, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = fmt.Fprintf(f, "\n%s\n", strings.TrimSpace(publicKey))
	return err
}

// GetHomeDir returns the user's home directory.
func (a *App) GetHomeDir() (string, error) {
	return os.UserHomeDir()
}
