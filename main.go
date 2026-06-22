package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var appIcon []byte

func main() {
	app := NewApp()

	err := wails.Run(&options.App{
		Title:  "Oberlicht",
		Width:  1024,
		Height: 768,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 15, G: 25, B: 35, A: 1},
		OnStartup:        app.startup,
		Linux: &linux.Options{
			Icon:            appIcon,
			ProgramName:     "Oberlicht",
			WebviewGpuPolicy: linux.WebviewGpuPolicyNever,
		},
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
