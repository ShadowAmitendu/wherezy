---
layout: default
title: Instructions
nav_order: 4
summary: Quickstart setup, Local LLM (Ollama/LM Studio), Gemini API, and LAN mobile scanning.
---

# Setup & Usage Instructions

[&larr; Back to Overview]({{ '/' | relative_url }})

## 1. Launch Wherezy

- **Desktop Installer / App**: Run `Wherezy-Setup-2.2.2.exe` (Windows) or open `Wherezy.app` (macOS) to launch the controller window. By default it binds to `127.0.0.1` over HTTP (`http://127.0.0.1:8000`) to avoid firewall or cert prompts; use the first-run notice or **Host** / **Enable HTTPS (TLS)** toggle whenever you want LAN phone access.
- **Terminal / Server CLI**:
  ```bash
  Wherezy.exe --headless --host 0.0.0.0 --port 8000 --https --open
  # Override port and database directory:
  Wherezy.exe --port 8080 --data-dir ./wherezy-data
  ```
- **Default Credentials**: Pick the **Admin** profile, enter the starter PIN (`0000`), and change your PIN immediately in **Settings &rsaquo; Profiles & Security**.

---

## 2. Configure Private AI (Local LLM or Gemini API)

### Option A: Local LLM (100% Offline via Ollama or LM Studio)

1. Install [Ollama](https://ollama.com) (`ollama pull qwen2.5:7b` or a vision model such as `qwen2.5vl:7b`) or start LM Studio's Local Server.
2. In Wherezy, open **Settings &rsaquo; AI Assistant Provider** and choose **Local LLM (Ollama / LM Studio / Custom)**.
3. Select the **Ollama** (`http://127.0.0.1:11434/v1`) or **LM Studio** (`http://127.0.0.1:1234/v1`) preset chip, click **Fetch Models**, optionally enter a Whisper STT model (`whisper-1`), and click **Test Connection** &rarr; **Save AI Settings**.

### Option B: Google Gemini API Key

1. Open **Settings &rsaquo; AI Assistant Provider**, choose **Cloud API Key (Gemini)**, paste your API key, and click **Test Connection** &rarr; **Save AI Settings** (keys are Fernet-encrypted at rest).
2. Or provide `GEMINI_API_KEY` via environment variable before launching:
   ```bash
   GEMINI_API_KEY="AIza..." ./wherezy --headless --open
   ```

---

## 3. Phone Access, HTTPS & Scanning Over Wi-Fi

1. To connect phones or tablets over Home Wi-Fi, choose **LAN + HTTPS (Camera Ready)** in the first-run notice (or set Host to `0.0.0.0` and turn on **Enable HTTPS (TLS)** in Controller settings).
2. Open the **LAN / Phone** link (`https://<your-lan-ip>:8000`) on your phone and accept the one-time self-signed certificate prompt — live **Camera Barcode/QR Scanning** and **Voice AI Recording** now work directly in Safari and Chrome!
3. If using plain HTTP over LAN instead (`http://<your-lan-ip>:8000`), use **Scan &rsaquo; Take Photo of Code** to decode QR or Code 128 barcodes from a camera snapshot, or scan printed item QR labels directly with your phone camera.

---

## 4. Backups & Upgrades

- **Full Backup**: Go to **Settings &rsaquo; Database & Storage** and click **Download Backup (.zip)** to export `inventory.db`, `photos/`, and `files/`.
- **Safe Upgrade**: Run a newer installer (e.g. `Wherezy-Setup-2.2.2.exe`) over an older version — user data lives outside the install directory (`%LOCALAPPDATA%\Wherezy\data` on Windows, `~/Library/Application Support/Wherezy/data` on macOS) and Wherezy automatically writes a pre-migration `.bak` copy of `inventory.db` whenever a schema update runs.
