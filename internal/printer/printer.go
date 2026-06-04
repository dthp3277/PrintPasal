package printer

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// Printer represents a system printer.
type Printer struct {
	Name          string `json:"name"`
	PrinterStatus uint32 `json:"status"`
	Type          uint32 `json:"type"`
	PortName      string `json:"port_name"`
}

// List returns a list of available printers on the system.
func List() ([]Printer, error) {
	if runtime.GOOS != "windows" {
		return nil, fmt.Errorf("printer list only supported on windows")
	}

	cmd := exec.Command("powershell", "-Command", "Get-Printer | Select-Object Name, PrinterStatus, Type, PortName | ConvertTo-Json")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to list printers: %w", err)
	}

	var printers []Printer
	// Handle single object vs array from ConvertTo-Json
	if err := json.Unmarshal(output, &printers); err != nil {
		var single Printer
		if err := json.Unmarshal(output, &single); err != nil {
			return nil, fmt.Errorf("failed to parse printer JSON: %w", err)
		}
		printers = append(printers, single)
	}

	return printers, nil
}

// Print sends a file to the specified printer.
func Print(filePath, printerName string) error {
	if runtime.GOOS != "windows" {
		return fmt.Errorf("printing only supported on windows")
	}

	ext := strings.ToLower(filepath.Ext(filePath))
	absPath, err := filepath.Abs(filePath)
	if err != nil {
		return err
	}

	// If a specific printer is requested, set it as default temporarily.
	// This is the most compatible way for "low-resource" apps like mspaint/wordpad.
	var oldDefault string
	if printerName != "" {
		out, err := exec.Command("powershell", "-Command", "(Get-WmiObject -Query \"Select * from Win32_Printer Where Default = True\").Name").Output()
		if err == nil {
			oldDefault = strings.TrimSpace(string(out))
		}
		
		err = exec.Command("powershell", "-Command", fmt.Sprintf("(New-Object -ComObject WScript.Network).SetDefaultPrinter('%s')", printerName)).Run()
		if err != nil {
			return fmt.Errorf("failed to set default printer to %s: %w", printerName, err)
		}
		
		// Restore default printer after we're done (or at least try to)
		defer func() {
			if oldDefault != "" {
				exec.Command("powershell", "-Command", fmt.Sprintf("(New-Object -ComObject WScript.Network).SetDefaultPrinter('%s')", oldDefault)).Run()
			}
		}()
	}

	var cmd *exec.Cmd
	switch ext {
	case ".jpg", ".jpeg", ".png", ".bmp":
		// mspaint /p is very reliable for images
		cmd = exec.Command("mspaint", "/p", absPath)
	case ".pdf", ".doc", ".docx", ".xls", ".xlsx":
		// Start-Process -Verb Print uses the registered handler (Edge, Word, etc.)
		cmd = exec.Command("powershell", "-Command", fmt.Sprintf("Start-Process -FilePath '%s' -Verb Print", absPath))
	default:
		// Fallback for text files
		cmd = exec.Command("powershell", "-Command", fmt.Sprintf("Start-Process -FilePath '%s' -Verb Print", absPath))
	}

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to print %s: %w", filePath, err)
	}

	return nil
}
