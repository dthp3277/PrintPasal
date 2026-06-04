// Package fileutil handles everything related to saving downloaded files:
// naming, sanitisation, collision avoidance, and disk writing.
package fileutil

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// Metadata holds rich information about a downloaded file.
type Metadata struct {
	Source        string `json:"source"`         // "WhatsApp" or "Gmail"
	SenderName    string `json:"sender_name"`    // Display name (e.g. "Dhiraj Thapa")
	SenderContact string `json:"sender_contact"` // Phone number (WA) or email address (Gmail)
	Subject       string `json:"subject"`        // Gmail subject; empty for WhatsApp
	Caption       string `json:"caption"`        // WhatsApp caption; empty for Gmail
	FileSize      int64  `json:"file_size"`      // Bytes
	Time          string `json:"time"`           // RFC3339 timestamp
}

// Source identifies where a file came from.
type Source string

const (
	SourceGmail    Source = "Gmail"
	SourceWhatsApp Source = "WA"
)

// illegalChars matches characters that are not safe in Windows filenames.
var illegalChars = regexp.MustCompile(`[<>:"/\\|?*\x00-\x1f]`)

// multiUnder collapses runs of underscores.
var multiUnder = regexp.MustCompile(`_+`)

// Sanitise removes characters that are unsafe in Windows filenames,
// collapses whitespace and underscores, and truncates to 40 chars.
func Sanitise(s string) string {
	if strings.TrimSpace(s) == "" {
		return "Unknown"
	}
	s = illegalChars.ReplaceAllString(s, "")
	s = strings.ReplaceAll(s, " ", "_")
	s = multiUnder.ReplaceAllString(s, "_")
	s = strings.Trim(s, "_")
	if len(s) > 40 {
		s = s[:40]
	}
	return s
}

// BuildFilename constructs the final filename for a downloaded file.
//
// Pattern:  YYYY-MM-DD_HHMM_<Source>_<SenderName>_<OriginalName>.<ext>
// Examples:
//
//	2025-05-28_1042_WA_Ramesh_Tamang_cv.pdf
//	2025-05-28_1043_Gmail_Sita_Rai_report.docx
//	2025-05-28_1055_WA_9841123456_photo.jpg
func BuildFilename(src Source, senderName, originalName string) string {
	ts := time.Now().Format("2006-01-02_1504")

	ext := strings.ToLower(filepath.Ext(originalName))
	base := strings.TrimSuffix(filepath.Base(originalName), filepath.Ext(originalName))

	sender := Sanitise(senderName)
	origSafe := Sanitise(base)

	return fmt.Sprintf("%s_%s_%s_%s%s", ts, src, sender, origSafe, ext)
}

// SaveFile writes data to downloadsDir/<filename>, handling collisions.
// If the exact filename already exists, it appends _2, _3, etc.
// Returns the full path of the saved file.
func SaveFile(downloadsDir, filename string, data []byte) (string, error) {
	if err := os.MkdirAll(downloadsDir, 0755); err != nil {
		return "", fmt.Errorf("could not create downloads dir: %w", err)
	}

	dest := filepath.Join(downloadsDir, filename)

	// Collision avoidance
	if _, err := os.Stat(dest); err == nil {
		ext := filepath.Ext(filename)
		base := strings.TrimSuffix(filename, ext)
		for n := 2; ; n++ {
			candidate := filepath.Join(downloadsDir, fmt.Sprintf("%s_%d%s", base, n, ext))
			if _, err := os.Stat(candidate); os.IsNotExist(err) {
				dest = candidate
				break
			}
		}
	}

	if err := os.WriteFile(dest, data, 0644); err != nil {
		return "", fmt.Errorf("could not write file: %w", err)
	}

	return dest, nil
}

// IsAllowed returns true if the file extension is in the allowed set.
func IsAllowed(allowed map[string]bool, filename string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	return allowed[ext]
}

// SaveMetadata writes a JSON metadata file for a downloaded file.
func SaveMetadata(downloadsDir, filename string, meta interface{}) error {
	data, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(downloadsDir, filename), data, 0644)
}

// SaveRichMetadata writes a typed Metadata JSON sidecar next to the file.
func SaveRichMetadata(downloadsDir, dataFilename string, meta Metadata) error {
	return SaveMetadata(downloadsDir, dataFilename+".json", meta)
}
