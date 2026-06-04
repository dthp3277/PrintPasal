package whatsapp

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	_ "modernc.org/sqlite"

	"printshop/internal/config"
	"printshop/internal/fileutil"
	"printshop/internal/store"
	"printshop/internal/web"
)

const logSource = "WhatsApp"

type Client struct {
	wa  *whatsmeow.Client
	cfg *config.Config
	log *store.Logger
	web *web.Hub
}

var mimeToExt = map[string]string{
	"application/pdf": ".pdf",
	"image/jpeg":      ".jpg",
	"image/jpg":       ".jpg",
	"image/png":       ".png",
	"application/msword":                                                       ".doc",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
	"application/vnd.ms-excel":                                                ".xls",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":       ".xlsx",
}

func New(ctx context.Context, cfg *config.Config, log *store.Logger, hub *web.Hub) (*Client, error) {
	if err := os.MkdirAll(cfg.WhatsApp.SessionDir, 0755); err != nil {
		return nil, err
	}

	dbPath := filepath.Join(cfg.WhatsApp.SessionDir, "session.db")

	// modernc.org/sqlite requires this pragma in the DSN to enable foreign keys
	dsn := "file:" + dbPath + "?_pragma=foreign_keys(1)"
	container, err := sqlstore.New(ctx, "sqlite", dsn, waLog.Noop)
	if err != nil {
		return nil, err
	}

	deviceStore, err := container.GetFirstDevice(ctx)
	if err != nil {
		return nil, err
	}

	waClient := whatsmeow.NewClient(deviceStore, waLog.Noop)
	c := &Client{wa: waClient, cfg: cfg, log: log, web: hub}
	waClient.AddEventHandler(c.handleEvent)

	return c, nil
}

func (c *Client) Connect(ctx context.Context) error {
	if c.wa.Store.ID == nil {
		qrChan, _ := c.wa.GetQRChannel(ctx)
		if err := c.wa.Connect(); err != nil {
			return err
		}

		c.log.Info(logSource, "No saved session — scan the QR code in the Web UI.")

		for evt := range qrChan {
			switch evt.Event {
			case "code":
				// Send the raw QR string — frontend renders it into a proper QR image
				c.web.Broadcast(web.Message{Type: "status", Payload: map[string]string{
					"whatsapp": "pending",
					"wa_qr":    evt.Code,
				}})
			case "success":
				c.log.Info(logSource, "✓ QR scanned successfully.")
				c.web.Broadcast(web.Message{Type: "status", Payload: map[string]string{
					"whatsapp": "connected",
					"whatsapp_account": c.wa.Store.ID.User,
				}})
			case "timeout":
				c.log.Warn(logSource, "QR code expired.")
				c.web.Broadcast(web.Message{Type: "status", Payload: map[string]string{"whatsapp": "expired"}})
			}
		}
	} else {
		if err := c.wa.Connect(); err != nil {
			c.web.Broadcast(web.Message{Type: "status", Payload: map[string]string{"whatsapp": "failed"}})
			return err
		}
		c.log.Info(logSource, "✓ Reconnected with saved session.")
		c.web.Broadcast(web.Message{Type: "status", Payload: map[string]string{
			"whatsapp": "connected",
			"whatsapp_account": c.wa.Store.ID.String(),
		}})
	}
	return nil
}

func (c *Client) Disconnect() {
	c.wa.Disconnect()
}

func (c *Client) handleEvent(rawEvt interface{}) {
	evt, ok := rawEvt.(*events.Message)
	if !ok {
		return
	}
	msg := evt.Message
	info := evt.Info

	senderName := info.PushName
	if strings.TrimSpace(senderName) == "" {
		senderName = info.Sender.User
	}
	// Sender.User is the raw phone number from the JID (e.g. "9779841123456").
	// Always prefix with '+' so it displays as an international number.
	senderPhone := "+" + info.Sender.User

	switch {
	case msg.GetDocumentMessage() != nil:
		c.handleDocument(context.Background(), msg.GetDocumentMessage(), senderName, senderPhone)
	case msg.GetImageMessage() != nil:
		c.handleImage(context.Background(), msg.GetImageMessage(), senderName, senderPhone)
	}
}

func (c *Client) handleDocument(ctx context.Context, doc *waE2E.DocumentMessage, senderName, senderPhone string) {
	filename := doc.GetFileName()
	if filename == "" {
		ext := mimeToExt[doc.GetMimetype()]
		if ext == "" {
			c.log.Warnf(logSource, "Skipped unknown MIME type %q from %s", doc.GetMimetype(), senderName)
			return
		}
		filename = "document" + ext
	}
	if !fileutil.IsAllowed(config.AllowedExtensions, filename) {
		c.log.Warnf(logSource, "Skipped unsupported file %q from %s", filename, senderName)
		return
	}
	c.log.Infof(logSource, "Document from %q: %s", senderName, filename)
	c.downloadAndSave(ctx, doc.GetDirectPath(), doc.GetFileEncSHA256(), doc.GetFileSHA256(), doc.GetMediaKey(), whatsmeow.MediaDocument, senderName, senderPhone, filename, int(doc.GetFileLength()))
}

func (c *Client) handleImage(ctx context.Context, img *waE2E.ImageMessage, senderName, senderPhone string) {
	ext := mimeToExt[img.GetMimetype()]
	if ext == "" {
		ext = ".jpg"
	}
	c.log.Infof(logSource, "Image from %q", senderName)
	c.downloadAndSave(ctx, img.GetDirectPath(), img.GetFileEncSHA256(), img.GetFileSHA256(), img.GetMediaKey(), whatsmeow.MediaImage, senderName, senderPhone, "image"+ext, int(img.GetFileLength()))
}

func (c *Client) downloadAndSave(ctx context.Context, directPath string, fileEncSHA256, fileSHA256, mediaKey []byte, mediaType whatsmeow.MediaType, senderName, senderPhone, originalFilename string, fileLength int) {
	data, err := c.wa.DownloadMediaWithPath(ctx, directPath, fileEncSHA256, fileSHA256, mediaKey, fileLength, mediaType, "")
	if err != nil {
		c.log.Errorf(logSource, "Download failed from %s: %v", senderName, err)
		return
	}
	finalName := fileutil.BuildFilename(fileutil.SourceWhatsApp, senderName, originalFilename)
	dest, err := fileutil.SaveFile(c.cfg.DownloadsDir, finalName, data)
	if err != nil {
		c.log.Errorf(logSource, "Save failed from %s: %v", senderName, err)
		return
	}
	
	// Save rich metadata sidecar
	baseName := filepath.Base(dest)
	fileutil.SaveRichMetadata(c.cfg.DownloadsDir, baseName, fileutil.Metadata{
		Source:        "WhatsApp",
		SenderName:    senderName,
		SenderContact: senderPhone,
		Subject:       "",
		Caption:       "",
		FileSize:      int64(len(data)),
		Time:          time.Now().Format(time.RFC3339),
	})
	
	c.log.Infof(logSource, "  ✓ Saved: %s", filepath.Base(dest))
	
	// Notify Web UI
	c.web.Broadcast(web.Message{
		Type: "file",
		Payload: map[string]interface{}{
			"source":         "WhatsApp",
			"sender_name":    senderName,
			"sender_contact": senderPhone,
			"filename":       filepath.Base(dest),
			"file_size":      len(data),
			"time":           time.Now().Format(time.RFC3339),
		},
	})
}


