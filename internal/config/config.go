// Package config holds all runtime configuration for the printshop agent.
// Settings are loaded from config.json at startup.
// Defaults are applied so the app works out of the box with minimal setup.
package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// Config is the top-level config struct.
type Config struct {
	// DownloadsDir is where all downloaded files are saved.
	// Default: ./downloads
	DownloadsDir string `json:"downloads_dir"`

	// LogsDir is where daily log files are written.
	// Default: ./logs
	LogsDir string `json:"logs_dir"`

	// Gmail holds Gmail OAuth credentials and polling config.
	Gmail GmailConfig `json:"gmail"`

	// WhatsApp holds whatsmeow session config.
	WhatsApp WhatsAppConfig `json:"whatsapp"`

	// Printer holds default printer configuration.
	Printer PrinterConfig `json:"printer"`
}

type PrinterConfig struct {
	// DefaultPrinter is the name of the printer to use if none is specified.
	DefaultPrinter string `json:"default_printer"`
}

type GmailConfig struct {
	// CredentialsFile is the path to the OAuth2 credentials JSON
	// downloaded from Google Cloud Console.
	// Default: ./credentials.json
	CredentialsFile string `json:"credentials_file"`

	// TokenFile is where the OAuth2 token is saved after first auth.
	// Default: ./token.json
	TokenFile string `json:"token_file"`

	// PollIntervalSeconds is how often to check for new emails.
	// Default: 45 (stay within Gmail API free quota)
	PollIntervalSeconds int `json:"poll_interval_seconds"`

	// Enabled lets you turn Gmail off without removing config.
	Enabled bool `json:"enabled"`
}

type WhatsAppConfig struct {
	// SessionDir is where whatsmeow stores its SQLite session database.
	// Default: ./wa-session
	SessionDir string `json:"session_dir"`

	// Enabled lets you turn WhatsApp off without removing config.
	Enabled bool `json:"enabled"`
}

// AllowedExtensions is the set of file extensions we will download and save.
// Anything not in this list is silently skipped.
var AllowedExtensions = map[string]bool{
	".pdf":  true,
	".jpg":  true,
	".jpeg": true,
	".png":  true,
	".doc":  true,
	".docx": true,
	".xls":  true,
	".xlsx": true,
}

// defaults returns a Config with sensible out-of-the-box values.
func defaults() Config {
	return Config{
		DownloadsDir: "downloads",
		LogsDir:      "logs",
		Gmail: GmailConfig{
			CredentialsFile:     "credentials.json",
			TokenFile:           "token.json",
			PollIntervalSeconds: 45,
			Enabled:             true,
		},
		WhatsApp: WhatsAppConfig{
			SessionDir: "wa-session",
			Enabled:    true,
		},
	}
}

// Load reads config.json if it exists, otherwise returns defaults.
// It also writes a config.json with defaults if none exists,
// so users can see and edit all options.
func Load(path string) (*Config, error) {
	cfg := defaults()

	if _, err := os.Stat(path); os.IsNotExist(err) {
		// First run — write defaults so the user can see the file
		if err := write(path, cfg); err != nil {
			return nil, fmt.Errorf("could not write default config: %w", err)
		}
		return &cfg, nil
	}

	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("could not open %s: %w", path, err)
	}
	defer f.Close()

	if err := json.NewDecoder(f).Decode(&cfg); err != nil {
		return nil, fmt.Errorf("could not parse %s: %w", path, err)
	}

	return &cfg, nil
}

func write(path string, cfg Config) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	return enc.Encode(cfg)
}
