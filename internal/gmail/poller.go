package gmail

import (
	"context"
	"encoding/base64"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	gmailapi "google.golang.org/api/gmail/v1"

	"printshop/internal/config"
	"printshop/internal/fileutil"
	"printshop/internal/store"
	"printshop/internal/web"
)

const logSource = "Gmail"

// Poller checks Gmail for new emails with attachments on a fixed interval.
type Poller struct {
	svc      *gmailapi.Service
	cfg      *config.Config
	log      *store.Logger
	web      *web.Hub
	// gmail search query — only unread emails with attachments, last 2 days
	query    string
}

// NewPoller creates a Poller. Call Start() to begin polling.
func NewPoller(ctx context.Context, cfg *config.Config, log *store.Logger, hub *web.Hub) (*Poller, error) {
	svc, err := NewService(ctx, cfg.Gmail.CredentialsFile, cfg.Gmail.TokenFile)
	if err != nil {
		hub.Broadcast(web.Message{Type: "status", Payload: map[string]string{"gmail": "auth_required"}})
		return nil, err
	}
	
	profile, _ := svc.Users.GetProfile("me").Do()
	email := "connected"
	if profile != nil {
		email = profile.EmailAddress
	}

	hub.Broadcast(web.Message{Type: "status", Payload: map[string]string{
		"gmail": "connected",
		"gmail_account": email,
	}})
	return &Poller{
		svc:   svc,
		cfg:   cfg,
		log:   log,
		web:   hub,
		query: "is:unread has:attachment newer_than:2d",
	}, nil
}

// Start runs the poll loop. It blocks and should be called in a goroutine.
// It respects ctx cancellation for clean shutdown.
func (p *Poller) Start(ctx context.Context) {
	interval := time.Duration(p.cfg.Gmail.PollIntervalSeconds) * time.Second
	p.log.Infof(logSource, "Polling every %s", interval)

	// Poll immediately, then on interval
	p.poll(ctx)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			p.log.Info(logSource, "Shutting down poller.")
			return
		case <-ticker.C:
			p.poll(ctx)
		}
	}
}

// ManualSync triggers an immediate poll from an external signal.
func (p *Poller) ManualSync() {
	p.log.Info(logSource, "Manual sync triggered.")
	p.poll(context.Background())
}

// poll fetches unread emails with attachments and processes each one.
func (p *Poller) poll(ctx context.Context) {
	res, err := p.svc.Users.Messages.List("me").Q(p.query).Context(ctx).Do()
	if err != nil {
		p.log.Errorf(logSource, "List failed: %v", err)
		p.web.Broadcast(web.Message{Type: "status", Payload: map[string]string{"gmail": "failed"}})
		return
	}
	p.web.Broadcast(web.Message{Type: "status", Payload: map[string]string{"gmail": "connected"}})
	if len(res.Messages) == 0 {
		p.log.Info(logSource, "No new emails with attachments.")
		return
	}
	p.log.Infof(logSource, "Found %d unread email(s) with attachments.", len(res.Messages))

	for _, m := range res.Messages {
		if err := p.processMessage(ctx, m.Id); err != nil {
			p.log.Errorf(logSource, "Error processing message %s: %v", m.Id, err)
		}
	}
}

// processMessage downloads all printable attachments from one email,
// then marks the email as read so it's never processed again.
func (p *Poller) processMessage(ctx context.Context, id string) error {
	msg, err := p.svc.Users.Messages.Get("me", id).Format("full").Context(ctx).Do()
	if err != nil {
		return err
	}

	senderName := extractSenderName(msg.Payload.Headers)
	senderEmail := extractSenderEmail(msg.Payload.Headers)
	subject := extractHeader(msg.Payload.Headers, "Subject")

	p.log.Infof(logSource, "From: %q | Subject: %q", senderName, subject)

	// Walk all MIME parts recursively
	saved := 0
	p.walkParts(ctx, msg.Id, msg.Payload.Parts, senderName, senderEmail, subject, &saved)

	if saved == 0 {
		p.log.Infof(logSource, "  No printable attachments found (sender: %s)", senderName)
	}

	// Mark as read — prevents reprocessing on next poll
	_, err = p.svc.Users.Messages.Modify("me", id, &gmailapi.ModifyMessageRequest{
		RemoveLabelIds: []string{"UNREAD"},
	}).Context(ctx).Do()
	return err
}

// walkParts recurses through a MIME tree looking for file attachments.
func (p *Poller) walkParts(ctx context.Context, msgID string, parts []*gmailapi.MessagePart, senderName, senderEmail, subject string, saved *int) {
	for _, part := range parts {
		// Recurse into multipart/*
		if len(part.Parts) > 0 {
			p.walkParts(ctx, msgID, part.Parts, senderName, senderEmail, subject, saved)
		}
		// Real attachment: has a filename and an attachmentId
		if part.Filename == "" || part.Body == nil || part.Body.AttachmentId == "" {
			continue
		}
		if !fileutil.IsAllowed(config.AllowedExtensions, part.Filename) {
			p.log.Warnf(logSource, "  Skipped unsupported file: %q", part.Filename)
			continue
		}
		if err := p.downloadAttachment(ctx, msgID, part, senderName, senderEmail, subject); err != nil {
			p.log.Errorf(logSource, "  Download failed for %q: %v", part.Filename, err)
			continue
		}
		*saved++
	}
}

// downloadAttachment fetches one attachment from the Gmail API and saves it.
func (p *Poller) downloadAttachment(ctx context.Context, msgID string, part *gmailapi.MessagePart, senderName, senderEmail, subject string) error {
	att, err := p.svc.Users.Messages.Attachments.Get("me", msgID, part.Body.AttachmentId).Context(ctx).Do()
	if err != nil {
		return err
	}

	// Gmail uses base64url encoding
	data, err := base64.URLEncoding.DecodeString(att.Data)
	if err != nil {
		// Try standard base64 as fallback
		data, err = base64.StdEncoding.DecodeString(att.Data)
		if err != nil {
			return err
		}
	}

	filename := fileutil.BuildFilename(fileutil.SourceGmail, senderName, part.Filename)
	dest, err := fileutil.SaveFile(p.cfg.DownloadsDir, filename, data)
	if err != nil {
		return err
	}

	// Save rich metadata sidecar
	baseName := filepath.Base(dest)
	fileutil.SaveRichMetadata(p.cfg.DownloadsDir, baseName, fileutil.Metadata{
		Source:        "Gmail",
		SenderName:    senderName,
		SenderContact: senderEmail,
		Subject:       subject,
		Caption:       "",
		FileSize:      int64(len(data)),
		Time:          time.Now().Format(time.RFC3339),
	})

	p.log.Infof(logSource, "  ✓ Saved: %s", baseName)
	
	// Notify Web UI
	p.web.Broadcast(web.Message{
		Type: "file",
		Payload: map[string]interface{}{
			"source":         "Gmail",
			"sender_name":    senderName,
			"sender_contact": senderEmail,
			"subject":        subject,
			"filename":       baseName,
			"file_size":      len(data),
			"time":           time.Now().Format(time.RFC3339),
		},
	})
	return nil
}

// ─── Header helpers ───────────────────────────────────────────────────────────

var nameFromHeader = regexp.MustCompile(`^"?([^"<]+?)"?\s*<`)
var emailFromHeader = regexp.MustCompile(`<([^>]+)>`)

// extractSenderName parses a "From" header into a human-readable name.
//
//	"Ramesh Tamang <r@gmail.com>" → "Ramesh Tamang"
//	"r@gmail.com"                 → "r"  (part before @)
func extractSenderName(headers []*gmailapi.MessagePartHeader) string {
	from := extractHeader(headers, "From")
	if m := nameFromHeader.FindStringSubmatch(from); len(m) > 1 {
		return strings.TrimSpace(m[1])
	}
	// No display name — use local part of email
	if idx := strings.Index(from, "@"); idx > 0 {
		local := from[:idx]
		local = strings.TrimLeft(local, "<")
		return strings.TrimSpace(local)
	}
	return from
}

// extractSenderEmail parses a "From" header and returns the raw email address.
//
//	"Ramesh Tamang <r@gmail.com>" → "r@gmail.com"
//	"r@gmail.com"                 → "r@gmail.com"
func extractSenderEmail(headers []*gmailapi.MessagePartHeader) string {
	from := extractHeader(headers, "From")
	if m := emailFromHeader.FindStringSubmatch(from); len(m) > 1 {
		return strings.TrimSpace(m[1])
	}
	// The whole value might just be the raw email address
	if strings.Contains(from, "@") {
		return strings.TrimSpace(from)
	}
	return ""
}

func extractHeader(headers []*gmailapi.MessagePartHeader, name string) string {
	for _, h := range headers {
		if strings.EqualFold(h.Name, name) {
			return h.Value
		}
	}
	return ""
}
