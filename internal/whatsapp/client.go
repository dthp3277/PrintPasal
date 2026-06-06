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
	wa        *whatsmeow.Client
	container *sqlstore.Container
	cfg       *config.Config
	log       *store.Logger
	web       *web.Hub
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
	
	// Identity
	waClient.Store.Platform = "chrome"
	waClient.Store.BusinessName = "Chrome (Windows)"

	c := &Client{wa: waClient, container: container, cfg: cfg, log: log, web: hub}
	waClient.AddEventHandler(c.handleEvent)

	return c, nil
}

func (c *Client) Connect(ctx context.Context) error {
	// If already connected, do nothing
	if c.wa.IsConnected() {
		return nil
	}

	// RACE CONDITION FIX: Get the QR channel BEFORE connecting.
	// This ensures we catch the very first code emitted by the daemon.
	var qrChan <-chan whatsmeow.QRChannelItem
	if c.wa.Store.ID == nil {
		var err error
		qrChan, err = c.wa.GetQRChannel(ctx)
		if err != nil {
			return err
		}
		go c.qrListener(ctx, qrChan)
	}

	// Establish connection
	if err := c.wa.Connect(); err != nil {
		c.web.Broadcast(web.Message{Type: "status", Payload: map[string]string{"whatsapp": "failed"}})
		return err
	}

	// Status broadcast
	if c.wa.Store.ID != nil {
		c.log.Info(logSource, "✓ Session reconnected.")
		c.web.Broadcast(web.Message{Type: "status", Payload: map[string]string{
			"whatsapp": "connected",
			"whatsapp_account": c.wa.Store.ID.String(),
		}})
	} else {
		c.log.Info(logSource, "Waiting for authentication...")
	}
	
	return nil
}

func (c *Client) qrListener(ctx context.Context, qrChan <-chan whatsmeow.QRChannelItem) {
	for {
		select {
		case <-ctx.Done():
			return
		case evt, ok := <-qrChan:
			if !ok {
				return
			}
			if evt.Event == "code" {
				c.web.Broadcast(web.Message{Type: "status", Payload: map[string]string{
					"whatsapp": "pending",
					"wa_qr":    evt.Code,
				}})
			} else if evt.Event == "success" {
				c.log.Info(logSource, "✓ Pairing success.")
				c.web.Broadcast(web.Message{Type: "status", Payload: map[string]string{
					"whatsapp":         "connected",
					"whatsapp_account": c.wa.Store.ID.String(),
					"wa_qr":           "",
					"wa_pair_code":    "",
				}})
				return
			}
		}
	}
}

func (c *Client) PairPhone(ctx context.Context, phone string) (string, error) {
	if !c.wa.IsConnected() {
		if err := c.wa.Connect(); err != nil {
			return "", err
		}
	}
	// Chrome type for pairing
	return c.wa.PairPhone(ctx, phone, true, whatsmeow.PairClientChrome, "Chrome (Windows)")
}

func (c *Client) Disconnect() {
	c.wa.Disconnect()
}

func (c *Client) Close() {
	c.wa.Disconnect()
	if c.container != nil {
		c.container.Close()
	}
}

func (c *Client) Logout(ctx context.Context) error {
	err := c.wa.Logout(ctx)
	c.Close()
	return err
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
			return
		}
		filename = "document" + ext
	}
	if !fileutil.IsAllowed(config.AllowedExtensions, filename) {
		return
	}
	c.downloadAndSave(ctx, doc.GetDirectPath(), doc.GetFileEncSHA256(), doc.GetFileSHA256(), doc.GetMediaKey(), whatsmeow.MediaDocument, senderName, senderPhone, filename, int(doc.GetFileLength()))
}

func (c *Client) handleImage(ctx context.Context, img *waE2E.ImageMessage, senderName, senderPhone string) {
	ext := mimeToExt[img.GetMimetype()]
	if ext == "" {
		ext = ".jpg"
	}
	c.downloadAndSave(ctx, img.GetDirectPath(), img.GetFileEncSHA256(), img.GetFileSHA256(), img.GetMediaKey(), whatsmeow.MediaImage, senderName, senderPhone, "image"+ext, int(img.GetFileLength()))
}

func (c *Client) downloadAndSave(ctx context.Context, directPath string, fileEncSHA256, fileSHA256, mediaKey []byte, mediaType whatsmeow.MediaType, senderName, senderPhone, originalFilename string, fileLength int) {
	data, err := c.wa.DownloadMediaWithPath(ctx, directPath, fileEncSHA256, fileSHA256, mediaKey, fileLength, mediaType, "")
	if err != nil {
		return
	}
	finalName := fileutil.BuildFilename(fileutil.SourceWhatsApp, senderName, originalFilename)
	dest, err := fileutil.SaveFile(c.cfg.DownloadsDir, finalName, data)
	if err != nil {
		return
	}
	
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
