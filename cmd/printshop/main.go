// printshop — automatically downloads and renames print files from Gmail and WhatsApp.
package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"printshop/internal/config"
	"printshop/internal/gmail"
	"printshop/internal/store"
	"printshop/internal/web"
	"printshop/internal/whatsapp"
)

const banner = `
╔══════════════════════════════════════════════════════════════╗
║           PrintShop — file downloader                       ║
║                                                             ║
║   Files saved to:  downloads/                               ║
║   Logs saved to:   logs/                                    ║
║                                                             ║
║   Web UI:    http://localhost:8080                          ║
║   Gmail:     polling every 30 seconds                       ║
║   WhatsApp:  live (event-driven)                            ║
║                                                             ║
║   Press Ctrl+C to stop cleanly                              ║
╚══════════════════════════════════════════════════════════════╝
`

func main() {
	fmt.Print(banner)

	// 1. Config
	cfg, err := config.Load("config.json")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Config error: %v\n", err)
		os.Exit(1)
	}

	// 2. Logger
	log, err := store.NewLogger(cfg.LogsDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Logger error: %v\n", err)
		os.Exit(1)
	}

	// 3. Context
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	// 4. Web Server (Start this FIRST so UI is available)
	webServer := web.NewServer(log, cfg)
	go func() {
		if err := webServer.Start(":8080"); err != nil {
			log.Errorf("Main", "Web server failed: %v", err)
		}
	}()

	// 5. WhatsApp (Run in background)
	if cfg.WhatsApp.Enabled {
		go func() {
			waClient, err := whatsapp.New(ctx, cfg, log, webServer.Hub)
			if err != nil {
				log.Errorf("Main", "WhatsApp init failed: %v", err)
				return
			}
			
			webServer.OnWhatsAppTerminate = func() {
				log.Info("Main", "Terminating WhatsApp session...")
				waClient.Disconnect()
				os.RemoveAll(cfg.WhatsApp.SessionDir)
			}
			
			webServer.OnWhatsAppConnect = func() {
				log.Info("Main", "Connecting WhatsApp session...")
				go waClient.Connect(ctx)
			}

			if err := waClient.Connect(ctx); err != nil {
				log.Errorf("Main", "WhatsApp connect failed: %v", err)
			}
			defer waClient.Disconnect()
			<-ctx.Done()
		}()
	}

	// 6. Gmail (Run in background)
	if cfg.Gmail.Enabled {
		go func() {
			var poller *gmail.Poller
			var err error

			webServer.OnGmailTerminate = func() {
				log.Info("Main", "Terminating Gmail session...")
				os.Remove(cfg.Gmail.TokenFile)
				poller = nil
			}

			webServer.OnGmailGetAuthURL = func() (string, error) {
				return gmail.GetAuthURL(cfg.Gmail.CredentialsFile)
			}

			webServer.OnGmailSubmitCode = func(code string) error {
				log.Info("Main", "Exchanging Gmail auth code from web UI...")
				if err := gmail.ExchangeAndSaveToken(ctx, cfg.Gmail.CredentialsFile, cfg.Gmail.TokenFile, code); err != nil {
					log.Errorf("Main", "Gmail code exchange failed: %v", err)
					return err
				}
				var connectErr error
				poller, connectErr = gmail.NewPoller(ctx, cfg, log, webServer.Hub)
				if connectErr != nil {
					log.Errorf("Main", "Gmail reconnect after auth failed: %v", connectErr)
					return connectErr
				}
				go poller.Start(ctx)
				return nil
			}
			
			webServer.OnGmailConnect = func() {
				log.Info("Main", "Connecting Gmail session...")
				var connectErr error
				poller, connectErr = gmail.NewPoller(ctx, cfg, log, webServer.Hub)
				if connectErr == nil {
					go poller.Start(ctx)
				} else {
					log.Errorf("Main", "Gmail reconnect failed: %v", connectErr)
				}
			}
			
			webServer.OnGmailSync = func() {
				if poller != nil {
					poller.ManualSync()
				}
			}

			poller, err = gmail.NewPoller(ctx, cfg, log, webServer.Hub)
			if err != nil {
				log.Errorf("Main", "Gmail init failed: %v", err)
				// Don't return, keep goroutine alive so user can reconnect
			} else {
				go poller.Start(ctx)
			}
			<-ctx.Done()
		}()
	}

	// Wait for shutdown
	<-ctx.Done()
	fmt.Println("\nShutting down...")
}
