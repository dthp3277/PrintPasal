package web

import (
	"encoding/base64"
	"encoding/json"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"printshop/internal/config"
	"printshop/internal/fileutil"
	"printshop/internal/printer"
	"printshop/internal/store"
)

func init() {
	mime.AddExtensionType(".js", "application/javascript")
	mime.AddExtensionType(".mjs", "application/javascript")
	mime.AddExtensionType(".css", "text/css")
}

type Message struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

type Hub struct {
	clients    map[*websocket.Conn]bool
	broadcast  chan Message
	register   chan *websocket.Conn
	unregister chan *websocket.Conn
	mu         sync.Mutex
	log        *store.Logger

	lastStatus Message
}

func NewHub(log *store.Logger) *Hub {
	return &Hub{
		clients:    make(map[*websocket.Conn]bool),
		broadcast:  make(chan Message),
		register:   make(chan *websocket.Conn),
		unregister: make(chan *websocket.Conn),
		log:        log,
		lastStatus: Message{Type: "status", Payload: map[string]string{}},
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			// Send last known status immediately
			client.WriteJSON(h.lastStatus)
			h.mu.Unlock()
		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				client.Close()
			}
			h.mu.Unlock()
		case message := <-h.broadcast:
			h.mu.Lock()
			if message.Type == "status" {
				// Update persistent state
				payload, ok := h.lastStatus.Payload.(map[string]string)
				if !ok {
					payload = make(map[string]string)
				}
				newPayload, _ := message.Payload.(map[string]string)
				for k, v := range newPayload {
					payload[k] = v
				}
				h.lastStatus.Payload = payload
			}

			for client := range h.clients {
				err := client.WriteJSON(message)
				if err != nil {
					h.log.Errorf("Web", "Websocket error: %v", err)
					client.Close()
					delete(h.clients, client)
				}
			}
			h.mu.Unlock()
		}
	}
}

func (h *Hub) Broadcast(msg Message) {
	h.broadcast <- msg
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.log.Errorf("Web", "Upgrade error: %v", err)
		return
	}
	h.register <- conn

	go func() {
		defer func() {
			h.unregister <- conn
		}()
		for {
			var msg struct {
				Type    string `json:"type"`
				Command string `json:"command"`
				Target  string `json:"target"`
			}
			err := conn.ReadJSON(&msg)
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					h.log.Errorf("Web", "error: %v", err)
				}
				break
			}
			if msg.Type == "command" {
				h.log.Infof("Web", "Received command: %s for %s", msg.Command, msg.Target)
				// Broadcast the command so the server can handle it if needed
				// For now, we will just rely on the REST endpoints, OR we can handle it directly here!
				// Actually, we should call the handler functions directly if we can, but we are inside Hub.
			}
		}
	}()
}

type Server struct {
	Hub *Hub
	log *store.Logger
	cfg *config.Config

	OnWhatsAppTerminate func()
	OnGmailTerminate    func()
	OnWhatsAppConnect   func()
	OnWhatsAppConnectPhone func(phone string)
	OnGmailConnect      func()
	OnGmailSync         func()
	OnGmailGetAuthURL   func() (string, error)
	OnGmailSubmitCode   func(code string) error
}

func NewServer(log *store.Logger, cfg *config.Config) *Server {
	return &Server{
		Hub: NewHub(log),
		log: log,
		cfg: cfg,
	}
}

func (s *Server) Start(addr string) error {
	s.log.Infof("Web", "Starting server initialization on %s", addr)
	go s.Hub.Run()

	wd, _ := os.Getwd()
	execPath, _ := os.Executable()
	execDir := filepath.Dir(execPath)

	s.log.Infof("Web", "Paths: WD=%s | ExecDir=%s", wd, execDir)

	resolve := func(name, path string) string {
		if filepath.IsAbs(path) {
			s.log.Infof("Web", "Using absolute path for %s: %s", name, path)
			return path
		}
		t1 := filepath.Join(wd, path)
		if _, err := os.Stat(t1); err == nil {
			s.log.Infof("Web", "Found %s in WD: %s", name, t1)
			return t1
		}
		t2 := filepath.Join(execDir, path)
		s.log.Infof("Web", "Using fallback path for %s: %s", name, t2)
		return t2
	}

	mux := http.NewServeMux()
	mux.Handle("/ws", s.Hub)

	// Ensure data directories exist in WD if not absolute to prevent resolve() from falling back
	if !filepath.IsAbs(s.cfg.DownloadsDir) {
		os.MkdirAll(filepath.Join(wd, s.cfg.DownloadsDir), 0755)
	}
	os.MkdirAll(filepath.Join(wd, "previews"), 0755)

	downloadsDir := resolve("downloads", s.cfg.DownloadsDir)
	mux.Handle("/downloads/", http.StripPrefix("/downloads/", http.FileServer(http.Dir(downloadsDir))))

	previewsDir := resolve("previews", "previews")
	mux.Handle("/previews/", http.StripPrefix("/previews/", http.FileServer(http.Dir(previewsDir))))

	staticDir := resolve("static", filepath.Join("printpasal", "dist"))
	mux.Handle("/", http.FileServer(http.Dir(staticDir)))

	mux.HandleFunc("/api/files", func(w http.ResponseWriter, r *http.Request) {
		s.log.Infof("Web", "API Call: %s", r.URL.Path)
		s.handleFiles(w, r)
	})

	mux.HandleFunc("/api/files/clear", func(w http.ResponseWriter, r *http.Request) {
		s.log.Infof("Web", "API Call: %s", r.URL.Path)
		s.handleClearDownloads(w, r)
	})

	mux.HandleFunc("/api/terminate/", func(w http.ResponseWriter, r *http.Request) {
		s.log.Infof("Web", "API Call: %s", r.URL.Path)
		if strings.HasSuffix(r.URL.Path, "whatsapp") {
			s.handleTerminateWhatsApp(w, r)
		} else {
			s.handleTerminateGmail(w, r)
		}
	})

	mux.HandleFunc("/api/connect/", func(w http.ResponseWriter, r *http.Request) {
		s.log.Infof("Web", "API Call: %s", r.URL.Path)
		if strings.HasSuffix(r.URL.Path, "whatsapp/phone") {
			s.handleConnectWhatsAppPhone(w, r)
		} else if strings.HasSuffix(r.URL.Path, "whatsapp") {
			s.handleConnectWhatsApp(w, r)
		} else {
			s.handleConnectGmail(w, r)
		}
	})

	mux.HandleFunc("/api/sync/gmail", func(w http.ResponseWriter, r *http.Request) {
		s.log.Infof("Web", "API Call: %s", r.URL.Path)
		s.handleSyncGmail(w, r)
	})

	mux.HandleFunc("/api/gmail/auth-url", func(w http.ResponseWriter, r *http.Request) {
		s.log.Infof("Web", "API Call: %s", r.URL.Path)
		s.handleGmailAuthURL(w, r)
	})

	mux.HandleFunc("/api/gmail/auth-code", func(w http.ResponseWriter, r *http.Request) {
		s.log.Infof("Web", "API Call: %s", r.URL.Path)
		s.handleGmailAuthCode(w, r)
	})

	mux.HandleFunc("/api/debug-log", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Error string `json:"error"`
			Stack string `json:"componentStack"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err == nil {
			s.log.Errorf("ReactCrash", "Error: %s\nStack:\n%s", req.Error, req.Stack)
		}
		w.WriteHeader(200)
	})

	mux.HandleFunc("/api/printers", func(w http.ResponseWriter, r *http.Request) {
		s.log.Infof("Web", "API Call: %s", r.URL.Path)
		s.handlePrinters(w, r)
	})

	mux.HandleFunc("/api/preview", func(w http.ResponseWriter, r *http.Request) {
		s.log.Infof("Web", "API Call: %s", r.URL.Path)
		s.handlePreview(w, r)
	})

	mux.HandleFunc("/api/open-in-app", func(w http.ResponseWriter, r *http.Request) {
		s.log.Infof("Web", "API Call: %s", r.URL.Path)
		s.handleOpenInApp(w, r)
	})

	mux.HandleFunc("/api/open-in-explorer", func(w http.ResponseWriter, r *http.Request) {
		s.log.Infof("Web", "API Call: %s", r.URL.Path)
		s.handleOpenInExplorer(w, r)
	})

	mux.HandleFunc("/api/printer/native-settings", func(w http.ResponseWriter, r *http.Request) {
		s.log.Infof("Web", "API Call: %s", r.URL.Path)
		s.handleOpenPrinterNativeSettings(w, r)
	})

	mux.HandleFunc("/api/print", func(w http.ResponseWriter, r *http.Request) {
		s.log.Infof("Web", "API Call: %s", r.URL.Path)
		s.handlePrint(w, r)
	})

	mux.HandleFunc("/api/files/upload", func(w http.ResponseWriter, r *http.Request) {
		s.log.Infof("Web", "API Call: %s", r.URL.Path)
		s.handleUpload(w, r)
	})

	s.log.Infof("Web", "HTTP server listening on %s", addr)
	return http.ListenAndServe(addr, mux)
}

func (s *Server) handleUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		Filename string `json:"filename"`
		Data     string `json:"data"` // Base64
		Source   string `json:"source"`
		Sender   string `json:"sender"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	// Remove base64 prefix if present
	if idx := strings.Index(body.Data, ","); idx != -1 {
		body.Data = body.Data[idx+1:]
	}

	decoded, err := base64.StdEncoding.DecodeString(body.Data)
	if err != nil {
		http.Error(w, "invalid base64 data", http.StatusBadRequest)
		return
	}

	path, err := fileutil.SaveFile(s.cfg.DownloadsDir, body.Filename, decoded)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Save metadata
	baseName := filepath.Base(path)
	fileutil.SaveRichMetadata(s.cfg.DownloadsDir, baseName, fileutil.Metadata{
		Source:     body.Source,
		SenderName: body.Sender,
		Time:       time.Now().Format(time.RFC3339),
		FileSize:   int64(len(decoded)),
	})

	s.log.Infof("Web", "Uploaded/Saved cropped file: %s", baseName)
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"filename": baseName})
}

type FileInfo struct {
	Filename      string `json:"filename"`
	Source        string `json:"source"`
	SenderName    string `json:"sender_name"`
	SenderContact string `json:"sender_contact"`
	Subject       string `json:"subject"`
	Caption       string `json:"caption"`
	FileSize      int64  `json:"file_size"`
	Time          string `json:"time"`
}

func (s *Server) handleFiles(w http.ResponseWriter, r *http.Request) {
	files, err := os.ReadDir(s.cfg.DownloadsDir)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var result []FileInfo
	for _, f := range files {
		if f.IsDir() || strings.HasSuffix(f.Name(), ".json") {
			continue
		}

		name := f.Name()
		jsonPath := filepath.Join(s.cfg.DownloadsDir, name+".json")

		var info FileInfo
		data, err := os.ReadFile(jsonPath)
		if err == nil {
			// Try parsing as rich Metadata struct first
			var meta fileutil.Metadata
			if jsonErr := json.Unmarshal(data, &meta); jsonErr == nil && meta.Source != "" {
				info.Source = meta.Source
				info.SenderName = meta.SenderName
				info.SenderContact = meta.SenderContact
				info.Subject = meta.Subject
				info.Caption = meta.Caption
				info.FileSize = meta.FileSize
				info.Time = meta.Time
			} else {
				// Fallback: legacy format with "source", "sender", "time" keys
				var legacy map[string]string
				if json.Unmarshal(data, &legacy) == nil {
					info.Source = legacy["source"]
					info.SenderName = legacy["sender"]
					info.Time = legacy["time"]
				}
			}
		} else {
			// No JSON sidecar at all — derive from filename pattern
			// Pattern: YYYY-MM-DD_HHMM_Source_SenderName_OriginalName.ext
			parts := strings.SplitN(name, "_", 4)
			info.Source = "Unknown"
			info.SenderName = "Unknown"
			if len(parts) >= 4 {
				info.Source = parts[2]
				info.SenderName = parts[3]
			}
			fInfo, _ := f.Info()
			if fInfo != nil {
				info.Time = fInfo.ModTime().Format("2006-01-02T15:04:05Z07:00")
				info.FileSize = fInfo.Size()
			}
		}
		// Always set filename from the directory listing (not from JSON)
		info.Filename = name

		result = append(result, info)
	}

	// Sort by time descending
	sort.Slice(result, func(i, j int) bool {
		return result[i].Time > result[j].Time
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (s *Server) handleClearDownloads(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	files, err := os.ReadDir(s.cfg.DownloadsDir)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	count := 0
	for _, f := range files {
		if f.IsDir() {
			continue
		}
		path := filepath.Join(s.cfg.DownloadsDir, f.Name())
		if err := os.Remove(path); err == nil {
			count++
		}
	}

	s.log.Infof("Web", "Cleared %d files from downloads directory", count)
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{"count": count})
}

func (s *Server) handleTerminateWhatsApp(w http.ResponseWriter, r *http.Request) {
	if s.OnWhatsAppTerminate != nil {
		s.OnWhatsAppTerminate()
		// Broadcaster already sends the clear signal via main.go
	}
	w.WriteHeader(http.StatusOK)
}

func (s *Server) handleTerminateGmail(w http.ResponseWriter, r *http.Request) {
	if s.OnGmailTerminate != nil {
		s.OnGmailTerminate()
		// Broadcast disconnect AND clear the stored account so reconnecting
		// clients never see the old email address from lastStatus.
		s.Hub.Broadcast(Message{Type: "status", Payload: map[string]string{
			"gmail":         "disconnected",
			"gmail_account": "",
		}})
	}
	w.WriteHeader(http.StatusOK)
}

func (s *Server) handleConnectWhatsApp(w http.ResponseWriter, r *http.Request) {
	if s.OnWhatsAppConnect != nil {
		s.OnWhatsAppConnect()
	}
	w.WriteHeader(http.StatusOK)
}

func (s *Server) handleConnectWhatsAppPhone(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Phone string `json:"phone"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if s.OnWhatsAppConnectPhone != nil {
		s.OnWhatsAppConnectPhone(body.Phone)
	}
	w.WriteHeader(http.StatusOK)
}

func (s *Server) handleConnectGmail(w http.ResponseWriter, r *http.Request) {
	if s.OnGmailConnect != nil {
		s.OnGmailConnect()
	}
	w.WriteHeader(http.StatusOK)
}

func (s *Server) handleSyncGmail(w http.ResponseWriter, r *http.Request) {
	if s.OnGmailSync != nil {
		s.OnGmailSync()
	}
	w.WriteHeader(http.StatusOK)
}

func (s *Server) handleGmailAuthURL(w http.ResponseWriter, r *http.Request) {
	if s.OnGmailGetAuthURL == nil {
		http.Error(w, "not configured", http.StatusServiceUnavailable)
		return
	}
	url, err := s.OnGmailGetAuthURL()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"url": url})
}

func (s *Server) handleGmailAuthCode(w http.ResponseWriter, r *http.Request) {
	if s.OnGmailSubmitCode == nil {
		http.Error(w, "not configured", http.StatusServiceUnavailable)
		return
	}
	var body struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Code) == "" {
		http.Error(w, "invalid or missing code", http.StatusBadRequest)
		return
	}
	if err := s.OnGmailSubmitCode(body.Code); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (s *Server) handlePrinters(w http.ResponseWriter, r *http.Request) {
	printers, err := printer.List()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(printers)
}

func (s *Server) handlePreview(w http.ResponseWriter, r *http.Request) {
	filename := r.URL.Query().Get("filename")
	if filename == "" {
		http.Error(w, "missing filename", http.StatusBadRequest)
		return
	}

	path := filepath.Join(s.cfg.DownloadsDir, filename)
	previewPath, err := printer.PreparePreview(path)
	if err != nil {
		s.log.Errorf("Web", "Preview error for %s: %v", filename, err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Convert absolute preview path back to a web URL
	// previewPath is something like C:\...\previews\file.pdf
	// We exposed /previews/ to the 'previews' directory
	wd, _ := os.Getwd()
	rel, err := filepath.Rel(filepath.Join(wd, "previews"), previewPath)
	if err != nil {
		// Fallback to just the filename if Rel fails
		rel = filepath.Base(previewPath)
	}
	
	url := "/previews/" + filepath.ToSlash(rel)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"url": url})
}

func (s *Server) handleOpenInApp(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Filename string `json:"filename"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	path := filepath.Join(s.cfg.DownloadsDir, body.Filename)
	err := printer.OpenNative(path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (s *Server) handleOpenInExplorer(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Filename string `json:"filename"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	path := filepath.Join(s.cfg.DownloadsDir, body.Filename)
	err := printer.OpenInExplorer(path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (s *Server) handlePrint(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Filename string `json:"filename"`
		Printer  string `json:"printer"`
		Copies   int    `json:"copies"`
		Orientation string `json:"orientation"`
		Duplex   string `json:"duplex"`
		Collate  bool   `json:"collate"`
		ColorMode string `json:"colorMode"`
		PaperSize string `json:"paperSize"`
		Layout   string `json:"layout"`
		PageRange string `json:"pageRange"`
		FileData string `json:"fileData,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	var path string
	if body.FileData != "" {
		data := body.FileData
		if idx := strings.Index(data, ","); idx != -1 {
			data = data[idx+1:]
		}
		decoded, err := base64.StdEncoding.DecodeString(data)
		if err != nil {
			http.Error(w, "invalid file data", http.StatusBadRequest)
			return
		}
		tmpFile := filepath.Join(s.cfg.DownloadsDir, ".tmp_"+body.Filename+".png")
		if err := os.WriteFile(tmpFile, decoded, 0644); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer os.Remove(tmpFile)
		path = tmpFile
	} else {
		path = filepath.Join(s.cfg.DownloadsDir, body.Filename)
		if _, err := os.Stat(path); err != nil {
			http.Error(w, "file not found", http.StatusNotFound)
			return
		}
	}

	s.log.Infof("Web", "Printing %s to %s", filepath.Base(path), body.Printer)
	err := printer.Print(path, body.Printer, printer.PrintOptions{
		Copies:      body.Copies,
		Orientation: body.Orientation,
		ColorMode:   body.ColorMode,
		Duplex:      body.Duplex,
		Collate:     body.Collate,
		PaperSize:   body.PaperSize,
		Layout:      body.Layout,
		PageRange:   body.PageRange,
	})
	if err != nil {
		s.log.Errorf("Web", "Print error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (s *Server) handleOpenPrinterNativeSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		Printer    string `json:"printer"`
		Properties bool   `json:"properties"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Printer) == "" {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	if err := printer.OpenNativeSettings(body.Printer, body.Properties); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}
