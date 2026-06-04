// Package gmail handles Gmail OAuth2 authentication and email polling.
package gmail

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	gmailapi "google.golang.org/api/gmail/v1"
	"google.golang.org/api/option"
)

// scopes we need: read emails + modify labels (to mark as read)
var scopes = []string{
	gmailapi.GmailReadonlyScope,
	gmailapi.GmailModifyScope,
}

// loadOAuthConfig reads credentials.json and returns an oauth2.Config.
func loadOAuthConfig(credentialsFile string) (*oauth2.Config, error) {
	data, err := os.ReadFile(credentialsFile)
	if err != nil {
		return nil, fmt.Errorf(
			"credentials.json not found at %q — see README for setup steps", credentialsFile)
	}
	cfg, err := google.ConfigFromJSON(data, scopes...)
	if err != nil {
		return nil, fmt.Errorf("invalid credentials.json: %w", err)
	}
	return cfg, nil
}

// loadToken reads a previously saved token.json.
func loadToken(tokenFile string) (*oauth2.Token, error) {
	f, err := os.Open(tokenFile)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	tok := &oauth2.Token{}
	if err := json.NewDecoder(f).Decode(tok); err != nil {
		return nil, err
	}
	return tok, nil
}

// saveToken persists a token to disk.
func saveToken(tokenFile string, tok *oauth2.Token) error {
	f, err := os.Create(tokenFile)
	if err != nil {
		return err
	}
	defer f.Close()
	return json.NewEncoder(f).Encode(tok)
}

// NewService creates an authenticated Gmail API client.
// On first run (no token.json), it prints an auth URL and waits for the user
// to paste the code — this is the standard OAuth2 installed-app flow.
func NewService(ctx context.Context, credentialsFile, tokenFile string) (*gmailapi.Service, error) {
	cfg, err := loadOAuthConfig(credentialsFile)
	if err != nil {
		return nil, err
	}

	tok, err := loadToken(tokenFile)
	if err != nil {
		// First run — guide the user through the OAuth flow
		tok, err = runOAuthFlow(cfg, tokenFile)
		if err != nil {
			return nil, err
		}
	}

	client := cfg.Client(ctx, tok)
	svc, err := gmailapi.NewService(ctx, option.WithHTTPClient(client))
	if err != nil {
		return nil, fmt.Errorf("could not create Gmail service: %w", err)
	}
	return svc, nil
}

// runOAuthFlow prints the authorisation URL, reads the code from stdin,
// exchanges it for a token, and saves it to tokenFile.
func runOAuthFlow(cfg *oauth2.Config, tokenFile string) (*oauth2.Token, error) {
	cfg.RedirectURL = "urn:ietf:wg:oauth:2.0:oob" // installed-app flow

	authURL := cfg.AuthCodeURL("state-token", oauth2.AccessTypeOffline)
	fmt.Println()
	fmt.Println("════════════════════════════════════════════════════════════")
	fmt.Println("  GMAIL AUTHORISATION — do this once")
	fmt.Println("════════════════════════════════════════════════════════════")
	fmt.Println()
	fmt.Println("  1. Open this URL in your browser:")
	fmt.Println()
	fmt.Println("    ", authURL)
	fmt.Println()
	fmt.Println("  2. Sign in with your Gmail account and click Allow.")
	fmt.Println("  3. Copy the code shown and paste it below.")
	fmt.Println()
	fmt.Print("  Paste code here: ")

	var code string
	if _, err := fmt.Scan(&code); err != nil {
		return nil, fmt.Errorf("could not read auth code: %w", err)
	}

	tok, err := cfg.Exchange(context.Background(), code)
	if err != nil {
		return nil, fmt.Errorf("could not exchange auth code: %w", err)
	}

	if err := saveToken(tokenFile, tok); err != nil {
		return nil, fmt.Errorf("could not save token: %w", err)
	}

	fmt.Println()
	fmt.Println("  ✓ Gmail authorised successfully.")
	fmt.Println()
	return tok, nil
}

// GetAuthURL loads credentials and returns the OAuth 2.0 authorization URL
// for the installed-app (out-of-band) flow, without blocking.
func GetAuthURL(credentialsFile string) (string, error) {
	cfg, err := loadOAuthConfig(credentialsFile)
	if err != nil {
		return "", err
	}
	cfg.RedirectURL = "urn:ietf:wg:oauth:2.0:oob"
	return cfg.AuthCodeURL("state-token", oauth2.AccessTypeOffline), nil
}

// ExchangeAndSaveToken exchanges an OAuth 2.0 authorization code for a token
// and saves it to tokenFile. Call GetAuthURL first to get the code.
func ExchangeAndSaveToken(ctx context.Context, credentialsFile, tokenFile, code string) error {
	cfg, err := loadOAuthConfig(credentialsFile)
	if err != nil {
		return err
	}
	cfg.RedirectURL = "urn:ietf:wg:oauth:2.0:oob"
	tok, err := cfg.Exchange(ctx, strings.TrimSpace(code))
	if err != nil {
		return fmt.Errorf("could not exchange auth code: %w", err)
	}
	return saveToken(tokenFile, tok)
}
