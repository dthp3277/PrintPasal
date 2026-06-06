package printer

import (
	"bufio"
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// Printer represents a system printer.
type Printer struct {
	Name          string `json:"name"`
	PrinterStatus uint32 `json:"status"`
	Type          string `json:"type"`
	PortName      string `json:"port_name"`
	IsShared      bool   `json:"is_shared"`
	IsDefault     bool   `json:"is_default"`
}

// List returns available printers using WMI in a way compatible with PowerShell 2.0 (Windows 7).
func List() ([]Printer, error) {
	if runtime.GOOS != "windows" {
		return nil, fmt.Errorf("printer list only supported on windows")
	}

	script := `Get-WmiObject -Class Win32_Printer | ForEach-Object { 
		write-host ("{0}|{1}|{2}|{3}|{4}" -f $_.Name, $_.PrinterStatus, $_.Shared, $_.PortName, $_.Default) 
	}`
	
	cmd := exec.Command("powershell", "-NoProfile", "-Command", script)
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("printer discovery failed: %w", err)
	}

	var printers []Printer
	scanner := bufio.NewScanner(bytes.NewReader(output))
	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.Split(line, "|")
		if len(parts) < 5 {
			continue
		}

		p := Printer{
			Name:      parts[0],
			PortName:  parts[3],
			IsShared:  parts[2] == "True",
			IsDefault: parts[4] == "True",
			Type:      "local",
		}
		
		if strings.HasPrefix(p.PortName, "IP_") || strings.HasPrefix(p.PortName, "\\\\") {
			p.Type = "network"
		} else if strings.Contains(strings.ToLower(p.PortName), "usb") {
			p.Type = "usb"
		}

		printers = append(printers, p)
	}

	return printers, nil
}

// Print sends a file to the printer.
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

// Print sends a file to the printer.
func Print(filePath, printerName string) error {
	absPath, err := filepath.Abs(filePath)
	if err != nil {
		return err
	}

	logPrinter(fmt.Sprintf("Job Initialized: %s -> %s", filepath.Base(absPath), printerName), colorCyan)

	ext := strings.ToLower(filepath.Ext(absPath))
	if ext == ".pdf" || ext == ".jpg" || ext == ".jpeg" || ext == ".png" {
		return printWithSumatra(absPath, printerName)
	}
	return printWithShellVerb(absPath, printerName)
}

func OpenNative(filePath string) error {
	absPath, err := filepath.Abs(filePath)
	if err != nil {
		return err
	}
	return exec.Command("cmd", "/c", "start", "", absPath).Run()
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
		os.MkdirAll(cacheDir, 0755)
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

func printWithSumatra(filePath, printerName string) error {
	sumatraPath, _ := filepath.Abs(filepath.Join("bin", "SumatraPDF.exe"))
	if _, err := os.Stat(sumatraPath); err != nil {
		logPrinter("SumatraPDF not found in bin/, falling back to Shell Verb", colorYellow)
		return printWithShellVerb(filePath, printerName)
	}

	absFile, _ := filepath.Abs(filePath)

	logPrinter("Engine: SumatraPDF (Direct Call)", colorBlue)
	logPrinter(fmt.Sprintf("Target Printer: [%s]", printerName), colorCyan)
	
	// Direct execution is much safer for handling slashes and spaces.
	// Go handles the escaping for the OS automatically.
	cmd := exec.Command(sumatraPath, 
		"-print-to", printerName, 
		"-print-settings", "fit", 
		"-silent", 
		absFile,
	)

	out, err := cmd.CombinedOutput()
	if err != nil {
		logPrinter(fmt.Sprintf("Sumatra Direct Call failed: %v, Output: %s", err, string(out)), colorRed)
		logPrinter("Trying Shell fallback...", colorYellow)
		return printWithShellVerb(filePath, printerName)
	}
	
	logPrinter("SumatraPDF reported success. Check print queue now.", colorGreen)
	return nil
}

func printWithShellVerb(filePath, printerName string) error {
	logPrinter("Engine: Windows Shell (Print Verb)", colorBlue)
	escapedPrinter := strings.ReplaceAll(printerName, "'", "''")
	escapedFile := strings.ReplaceAll(filePath, "'", "''")

	// 1. Set Default (COM method)
	logPrinter(fmt.Sprintf("Setting default printer to: %s", printerName), colorCyan)
	setCmd := fmt.Sprintf(`(New-Object -ComObject WScript.Network).SetDefaultPrinter('%s')`, escapedPrinter)
	out, err := exec.Command("powershell", "-NoProfile", "-Command", setCmd).CombinedOutput()
	if err != nil {
		return fmt.Errorf("com-set-default error: %v, output: %s", err, string(out))
	}

	// 2. Print Verb
	logPrinter(fmt.Sprintf("Triggering 'Print' verb for: %s", filepath.Base(filePath)), colorCyan)
	printCmd := fmt.Sprintf(`Start-Process -FilePath "%s" -Verb Print`, escapedFile)
	out, err = exec.Command("powershell", "-NoProfile", "-Command", printCmd).CombinedOutput()
	if err != nil {
		return fmt.Errorf("print-verb error: %v, output: %s", err, string(out))
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
