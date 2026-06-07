package printer

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// Printer represents a system printer with normalized capability flags.
type Printer struct {
	Name                   string `json:"name"`
	Status                 string `json:"status"`
	StatusCode            uint32 `json:"status_code"`
	Availability          uint16 `json:"availability"`
	ConfigManagerErrorCode uint32 `json:"config_manager_error_code"`
	Type                   string `json:"type"`
	PortName               string `json:"port_name"`
	IsShared               bool   `json:"is_shared"`
	IsDefault              bool   `json:"is_default"`
	DriverName             string `json:"driver_name,omitempty"`
	SupportsColor          bool   `json:"supports_color"`
	SupportsDuplex         bool   `json:"supports_duplex"`
	SupportsCollate        bool   `json:"supports_collate"`
	SupportsCopies         bool   `json:"supports_copies"`
	Capabilities           []uint16 `json:"capabilities,omitempty"`
	CurrentCapabilities    []uint16 `json:"current_capabilities,omitempty"`
}

type PrintOptions struct {
	Copies      int
	Orientation string
	ColorMode   string
	Duplex      string
	Collate     bool
	PaperSize   string
	Layout      string
	PageRange   string
}

type printerRecord struct {
	Name                   string   `json:"Name"`
	PrinterStatus          uint32   `json:"PrinterStatus"`
	Availability           uint16   `json:"Availability"`
	ExtendedPrinterStatus  uint16   `json:"ExtendedPrinterStatus"`
	ConfigManagerErrorCode uint32   `json:"ConfigManagerErrorCode"`
	Shared                 bool     `json:"Shared"`
	PortName               string   `json:"PortName"`
	Default                bool     `json:"Default"`
	DriverName             string   `json:"DriverName"`
	Local                  bool     `json:"Local"`
	Network                bool     `json:"Network"`
	Capabilities           []uint16 `json:"Capabilities"`
	CurrentCapabilities    []uint16 `json:"CurrentCapabilities"`
}

// List returns available printers and normalized capability flags.
func List() ([]Printer, error) {
	if runtime.GOOS != "windows" {
		return nil, fmt.Errorf("printer list only supported on windows")
	}

	script := `@(
		Get-CimInstance Win32_Printer |
			Select-Object Name,PrinterStatus,Availability,ExtendedPrinterStatus,ConfigManagerErrorCode,Shared,PortName,Default,DriverName,Local,Network,Capabilities,CurrentCapabilities
	) | ConvertTo-Json -Depth 4 -Compress`

	cmd := exec.Command("powershell", "-NoProfile", "-Command", script)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("printer discovery failed: %w: %s", err, strings.TrimSpace(string(output)))
	}

	raw := strings.TrimSpace(string(output))
	if raw == "" || raw == "null" {
		return []Printer{}, nil
	}

	var records []printerRecord
	if err := json.Unmarshal([]byte(raw), &records); err != nil {
		var single printerRecord
		if singleErr := json.Unmarshal([]byte(raw), &single); singleErr != nil {
			return nil, fmt.Errorf("printer discovery parse failed: %w", err)
		}
		records = []printerRecord{single}
	}

	printers := make([]Printer, 0, len(records))
	for _, rec := range records {
		printers = append(printers, toPrinter(rec))
	}

	return printers, nil
}

const (
	colorReset  = "\033[0m"
	colorBlue   = "\033[34m"
	colorCyan   = "\033[36m"
	colorGreen  = "\033[32m"
	colorYellow = "\033[33m"
	colorRed    = "\033[31m"
)

func logPrinter(msg string, color string) {
	fmt.Printf("%s[PRINTER] %s%s\n", color, msg, colorReset)
}

// Print sends a file to the printer with the requested options.
func Print(filePath, printerName string, opts PrintOptions) error {
	absPath, err := filepath.Abs(filePath)
	if err != nil {
		return err
	}
	if opts.Copies < 1 {
		opts.Copies = 1
	}
	if opts.ColorMode == "" {
		opts.ColorMode = "color"
	}
	if opts.Duplex == "" {
		opts.Duplex = "simplex"
	}
	if opts.Layout == "" {
		opts.Layout = "fit"
	}
	if opts.Orientation == "" {
		opts.Orientation = "portrait"
	}

	logPrinter(fmt.Sprintf("Job Initialized: %s -> %s", filepath.Base(absPath), printerName), colorCyan)

	ext := strings.ToLower(filepath.Ext(absPath))
	if ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".bmp" {
		return printImageWithPowerShell(absPath, printerName, opts)
	}
	if ext == ".pdf" {
		return printWithSumatra(absPath, printerName, opts)
	}
	return printWithShellVerb(absPath, printerName, opts)
}

func OpenNative(filePath string) error {
	absPath, err := filepath.Abs(filePath)
	if err != nil {
		return err
	}
	return exec.Command("cmd", "/c", "start", "", absPath).Run()
}

func OpenNativeSettings(printerName string, properties bool) error {
	if runtime.GOOS != "windows" {
		return fmt.Errorf("native printer settings only supported on windows")
	}
	mode := "/e"
	if properties {
		mode = "/p"
	}
	cmd := exec.Command("rundll32.exe", "printui.dll,PrintUIEntry", mode, "/n", printerName)
	return cmd.Start()
}

func PreparePreview(filePath string) (string, error) {
	absPath, err := filepath.Abs(filePath)
	if err != nil {
		return "", err
	}
	ext := strings.ToLower(filepath.Ext(absPath))
	if ext == ".pdf" || ext == ".jpg" || ext == ".jpeg" || ext == ".png" {
		return absPath, nil
	}
	if ext == ".docx" || ext == ".doc" {
		cacheDir := "previews"
		if err := os.MkdirAll(cacheDir, 0o755); err != nil {
			return "", err
		}
		pdfPath := filepath.Join(cacheDir, filepath.Base(absPath)+".preview.pdf")
		if _, err := os.Stat(pdfPath); err == nil {
			return pdfPath, nil
		}
		if err := convertWordToPdf(absPath, pdfPath); err != nil {
			return "", err
		}
		return pdfPath, nil
	}
	return "", fmt.Errorf("unsupported preview format")
}

func printWithSumatra(filePath, printerName string, opts PrintOptions) error {
	sumatraPath, _ := filepath.Abs(filepath.Join("bin", "SumatraPDF.exe"))
	if _, err := os.Stat(sumatraPath); err != nil {
		logPrinter("SumatraPDF not found in bin/, falling back to Shell Verb", colorYellow)
		return printWithShellVerb(filePath, printerName, opts)
	}

	logPrinter("Engine: SumatraPDF (Direct Call)", colorBlue)
	logPrinter(fmt.Sprintf("Target Printer: [%s]", printerName), colorCyan)

	runOnce := func(copyCount int) error {
		args := []string{
			"-print-to", printerName,
			"-print-settings", buildSumatraSettings(opts, copyCount),
			"-silent",
			filePath,
		}
		cmd := exec.Command(sumatraPath, args...)
		out, err := cmd.CombinedOutput()
		if err != nil {
			return fmt.Errorf("sumatra print failed: %v, output: %s", err, strings.TrimSpace(string(out)))
		}
		return nil
	}

	if opts.Collate && opts.Copies > 1 {
		for i := 0; i < opts.Copies; i++ {
			if err := runOnce(1); err != nil {
				logPrinter(fmt.Sprintf("Collated run %d failed: %v", i+1, err), colorRed)
				return err
			}
			if i < opts.Copies-1 {
				time.Sleep(150 * time.Millisecond)
			}
		}
		logPrinter("SumatraPDF reported success (collated by repeated single-copy jobs).", colorGreen)
		return nil
	}

	if err := runOnce(opts.Copies); err != nil {
		logPrinter(fmt.Sprintf("Sumatra Direct Call failed: %v", err), colorRed)
		logPrinter("Trying Shell fallback...", colorYellow)
		return printWithShellVerb(filePath, printerName, opts)
	}

	logPrinter("SumatraPDF reported success. Check print queue now.", colorGreen)
	return nil
}

func buildSumatraSettings(opts PrintOptions, copies int) string {
	settings := []string{}

	switch opts.Layout {
	case "original":
		settings = append(settings, "noscale")
	case "fill":
		settings = append(settings, "fit")
	default:
		settings = append(settings, "fit")
	}

	// Rather than forcing 'portrait' or 'landscape' which many printer drivers ignore
	// or misinterpret (resulting in shrunken, centered prints), we use 'autorotate'.
	// This lets Sumatra automatically orient the document to fit the printer's physical paper.
	settings = append(settings, "autorotate")

	switch strings.ToLower(opts.ColorMode) {
	case "mono", "monochrome":
		settings = append(settings, "monochrome")
	default:
		settings = append(settings, "color")
	}

	switch opts.Duplex {
	case "long-edge":
		settings = append(settings, "duplexlong")
	case "short-edge":
		settings = append(settings, "duplexshort")
	default:
		settings = append(settings, "simplex")
	}

	switch strings.ToLower(opts.PaperSize) {
	case "letter":
		settings = append(settings, "paper=letter")
	case "legal":
		settings = append(settings, "paper=legal")
	default:
		settings = append(settings, "paper=A4")
	}

	if copies > 1 {
		settings = append(settings, fmt.Sprintf("%dx", copies))
	}

	if opts.PageRange != "" && strings.ToLower(opts.PageRange) != "all" {
		// SumatraPDF supports ranges like "1,3,5-10"
		settings = append(settings, opts.PageRange)
	}

	return strings.Join(settings, ",")
}

func printWithShellVerb(filePath, printerName string, opts PrintOptions) error {
	logPrinter("Engine: Windows Shell (Print Verb)", colorBlue)
	escapedPrinter := strings.ReplaceAll(printerName, "'", "''")
	escapedFile := strings.ReplaceAll(filePath, "'", "''")

	// The shell verb cannot programmatically control per-job duplex/color/collate,
	// so we use it as a fallback only and keep the printer defaults in charge.
	logPrinter(fmt.Sprintf("Setting default printer to: %s", printerName), colorCyan)
	setCmd := fmt.Sprintf(`(New-Object -ComObject WScript.Network).SetDefaultPrinter('%s')`, escapedPrinter)
	out, err := exec.Command("powershell", "-NoProfile", "-Command", setCmd).CombinedOutput()
	if err != nil {
		return fmt.Errorf("com-set-default error: %v, output: %s", err, strings.TrimSpace(string(out)))
	}

	logPrinter(fmt.Sprintf("Triggering 'Print' verb for: %s", filepath.Base(filePath)), colorCyan)
	printCmd := fmt.Sprintf(`Start-Process -FilePath "%s" -Verb Print`, escapedFile)
	out, err = exec.Command("powershell", "-NoProfile", "-Command", printCmd).CombinedOutput()
	if err != nil {
		return fmt.Errorf("print-verb error: %v, output: %s", err, strings.TrimSpace(string(out)))
	}

	logPrinter("Shell Print command enqueued", colorGreen)
	return nil
}

func convertWordToPdf(sourcePath, targetPath string) error {
	escapedSource := strings.ReplaceAll(sourcePath, "'", "''")
	escapedTarget := strings.ReplaceAll(targetPath, "'", "''")

	script := fmt.Sprintf(`
		$word = New-Object -ComObject Word.Application
		$word.Visible = $false
		try {
			$doc = $word.Documents.Open('%s')
			$doc.SaveAs([ref]'%s', [ref]17)
			$doc.Close()
		} finally {
			$word.Quit()
		}
	`, escapedSource, escapedTarget)
	return exec.Command("powershell", "-NoProfile", "-Command", script).Run()
}

func toPrinter(rec printerRecord) Printer {
	caps := rec.CurrentCapabilities
	if len(caps) == 0 {
		caps = rec.Capabilities
	}

	printerType := "local"
	if rec.Network || strings.HasPrefix(rec.PortName, "IP_") || strings.HasPrefix(rec.PortName, `\\`) {
		printerType = "network"
	} else if strings.Contains(strings.ToLower(rec.PortName), "usb") {
		printerType = "usb"
	}

	status := deriveStatus(rec)
	return Printer{
		Name:                   rec.Name,
		Status:                 status,
		StatusCode:             rec.PrinterStatus,
		Availability:           rec.Availability,
		ConfigManagerErrorCode: rec.ConfigManagerErrorCode,
		Type:                   printerType,
		PortName:               rec.PortName,
		IsShared:               rec.Shared,
		IsDefault:              rec.Default,
		DriverName:             rec.DriverName,
		SupportsColor:          hasCapability(caps, 2),
		SupportsDuplex:         hasCapability(caps, 3),
		SupportsCopies:         true,
		SupportsCollate:        hasCapability(caps, 5),
		Capabilities:           rec.Capabilities,
		CurrentCapabilities:    rec.CurrentCapabilities,
	}
}

func deriveStatus(rec printerRecord) string {
	if rec.ConfigManagerErrorCode != 0 {
		return "offline"
	}

	if isOfflineAvailability(rec.Availability) {
		return "offline"
	}

	if rec.ExtendedPrinterStatus == 7 {
		return "offline"
	}

	switch rec.PrinterStatus {
	case 3:
		return "ready"
	case 4:
		return "printing"
	case 8:
		return "paused"
	case 9, 11, 14, 15, 16:
		return "offline"
	case 10, 12, 13, 17, 18:
		return "busy"
	default:
		if rec.Default {
			return "ready"
		}
		return "unknown"
	}
}

func isOfflineAvailability(v uint16) bool {
	switch v {
	case 8, 9, 11, 12, 13, 14, 15, 16:
		return true
	default:
		return false
	}
}

func hasCapability(caps []uint16, target uint16) bool {
	for _, cap := range caps {
		if cap == target {
			return true
		}
	}
	return false
}

func printImageWithPowerShell(filePath, printerName string, opts PrintOptions) error {
	logPrinter("Engine: PowerShell System.Drawing (Image Print)", colorBlue)
	
	escapedFile := strings.ReplaceAll(filePath, "'", "''")
	escapedPrinter := strings.ReplaceAll(printerName, "'", "''")
	
	landscapeStr := "$false"
	if strings.ToLower(opts.Orientation) == "landscape" {
		landscapeStr = "$true"
	}
	
	colorStr := "$true"
	if strings.ToLower(opts.ColorMode) == "mono" || strings.ToLower(opts.ColorMode) == "monochrome" {
		colorStr = "$false"
	}

	copies := opts.Copies
	if copies < 1 {
		copies = 1
	}

	script := fmt.Sprintf(`
Add-Type -AssemblyName System.Drawing

$filePath = '%s'
$printerName = '%s'
$landscape = %s
$color = %s
$copies = %d
$layout = '%s'

try {
    $img = [System.Drawing.Image]::FromFile($filePath)
    
    $doc = New-Object System.Drawing.Printing.PrintDocument
    $doc.PrinterSettings.PrinterName = $printerName
    $doc.PrinterSettings.Copies = $copies
    $doc.DefaultPageSettings.Landscape = $landscape
    $doc.DefaultPageSettings.Color = $color
    $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)

    $doc.add_PrintPage({
        param($sender, $e)
        
        $m = $e.PageBounds
        $w = $img.Width
        $h = $img.Height
        
        if ($layout -eq 'original') {
            $e.Graphics.DrawImage($img, $m.Left, $m.Top, $w, $h)
        } elseif ($layout -eq 'fill') {
            $e.Graphics.DrawImage($img, $m)
        } else {
            $ratioX = $m.Width / $w
            $ratioY = $m.Height / $h
            $ratio = [Math]::Min($ratioX, $ratioY)
            
            $newW = [int]($w * $ratio)
            $newH = [int]($h * $ratio)
            
            $posX = $m.Left + ($m.Width - $newW) / 2
            $posY = $m.Top + ($m.Height - $newH) / 2
            
            $e.Graphics.DrawImage($img, $posX, $posY, $newW, $newH)
        }
    })
    
    $doc.Print()
    $img.Dispose()
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
`, escapedFile, escapedPrinter, landscapeStr, colorStr, copies, opts.Layout)

	cmd := exec.Command("powershell", "-NoProfile", "-Command", script)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("powershell image print failed: %v, output: %s", err, strings.TrimSpace(string(out)))
	}
	
	logPrinter("PowerShell image print completed successfully.", colorGreen)
	return nil
}

