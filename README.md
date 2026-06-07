# Print Pasal — File Downloader + Printer

Automatically downloads and renames files sent to your Gmail or WhatsApp.
Saves everything to the `downloads/` folder, ready to print.

**Built in Go — no browser, no Chrome, ~15MB RAM usage.**

---

## File naming

Every file is saved as:
```
YYYY-MM-DD_HHMM_Source_SenderName_originalfile.ext
```

Examples:
```
2025-05-28_1042_WA_Ramesh_Tamang_cv.pdf
2025-05-28_1043_Gmail_Sita_Rai_report.docx
2025-05-28_1055_WA_9841123456_photo.jpg
```

- `WA` = WhatsApp,  `Gmail` = email
- WhatsApp uses the sender's display name (or their number if not saved)
- Gmail uses the display name from the "From" field

---

## Steps to Setup

### 1. Install Go

Download from: https://go.dev/dl/
Choose the **Windows .msi installer**. Keep all defaults.
After installing, open a new Command Prompt and confirm:
```
go version
```

### 2. Install GCC (needed for SQLite)

whatsmeow stores sessions in SQLite which needs a C compiler.

Download **TDM-GCC** (free, simple): https://jmeubank.github.io/tdm-gcc/
Run the installer, keep all defaults.

### 3. Setup SumatraPDF (for silent printing)

The app uses SumatraPDF to handle silent printing for PDFs and images.

1. Create a folder named `bin` in the project root.
2. Download **SumatraPDF Portable (64-bit)** from: https://www.sumatrapdfreader.org/download-free-pdf-viewer
3. Move the downloaded `.exe` into the `bin/` folder and rename it exactly to `SumatraPDF.exe`.

### 4. Get the code

Put the printshop folder anywhere, e.g. `C:\PrintShop\`

Open Command Prompt in that folder:
```
go mod tidy
```
This downloads all dependencies (~30 seconds).

### 5. Set up Gmail Credentials

**5a. Create a Google Cloud project**
1. Go to https://console.cloud.google.com
2. Top bar → "Select a project" → "New Project"
3. Name: `PrintShop` → Create

**5b. Enable Gmail API**
1. Go to "APIs & Services" → "Library"
2. Search "Gmail API" → Enable

**5c. Create OAuth credentials**
1. "APIs & Services" → "Credentials"
2. "Create Credentials" → "OAuth client ID"
3. Application type: **Desktop app**
4. Name: `PrintShop` → Create
5. Click the download ⬇ button → save as `credentials.json`
6. Move `credentials.json` into the PrintShop folder

**5d. Configure consent screen** (if asked)
1. "OAuth consent screen" → External → Fill in app name `PrintShop`
2. Add your Gmail as a test user

**5e. First run authorisation**
Run the app once:
```
go run ./cmd/printshop
```
It will print a URL. Open it in your browser, sign in, click Allow,
copy the code, paste it back into the terminal. Done.

### 6. WhatsApp setup

No extra setup. Once app runs, you can connect Whatsapp via the Connection Button.
Open WhatsApp on your phone → Linked Devices → Link a Device → scan.
The session is saved in `wa-session/` — you won't be asked again.

---

## Running

```
go run ./cmd/printshop
```

Or build a single .exe to double-click:
```
go build -ldflags="-s -w -H=windowsgui" -o printshop.exe ./cmd/printshop
```
*(The `-H=windowsgui` flag hides the black terminal window. If you want to see logs in the terminal, run `build.bat` after removing that flag, or just use `go run`)*

Then just double-click `printshop.exe`.

---

## Auto-start when PC turns on

1. Press `Win + R`, type `shell:startup`, press Enter
2. Right-click in that folder → New → Shortcut
3. Point it to `C:\PrintShop\printshop.exe`

---

## Config (config.json)

Created automatically on first run. You can edit it:

```json
{
  "downloads_dir": "downloads",
  "logs_dir": "logs",
  "gmail": {
    "credentials_file": "credentials.json",
    "token_file": "token.json",
    "poll_interval_seconds": 45,
    "enabled": true
  },
  "whatsapp": {
    "session_dir": "wa-session",
    "enabled": true
  }
}
```

Set `"enabled": false` to turn off Gmail or WhatsApp independently.

---

## Accepted file types

| Format | Extensions |
|--------|-----------|
| PDF | .pdf |
| Images | .jpg .jpeg .png |
| Word | .doc .docx |
| Excel | .xls .xlsx |

Everything else (videos, audio, zip, etc.) is skipped and logged.

---

## Logs

One log file per day in `logs/`, e.g. `logs/2025-05-28.log`.
Also printed to the console window while running.

---

## Troubleshooting

**`gcc not found` error**
Install TDM-GCC (see step 2 above) and restart Command Prompt.

**WhatsApp asks for QR again**
Delete the `wa-session/` folder, run again, and scan the QR.

**Gmail says credentials missing**
Make sure `credentials.json` is in the PrintShop folder.

**Gmail says token expired**
Delete `token.json`, run the app, and go through the browser auth once more.

**A file I expected is not in downloads/**
Check `logs/` — it will show if the file was skipped (unsupported type)
or if there was a download error.
