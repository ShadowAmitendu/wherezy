---
layout: default
title: Instructions
nav_order: 4
summary: Quickstart setup, Local LLM (Ollama/LM Studio), Gemini API, and LAN mobile scanning.
---

# Setup & Usage Instructions

[&larr; Back to Overview]({{ '/' | relative_url }})

## 1. Launch Wherezy

- **Desktop GUI**: Double-click `wherezy.exe` / `wherezy` to open the controller window. Click **Start Server**, optionally enable **Start with OS**, and click **Open Web UI**.
- **Terminal / Server CLI**:
  ```bash
  ./wherezy --headless --host 0.0.0.0 --port 8000 --open
  # Override port and database directory:
  ./wherezy --port 8080 --data-dir ./wherezy-data
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

## 3. Phone Access & Scanning Over Wi-Fi

1. Use the **LAN / Phone** link shown in the Desktop Controller (`http://<your-lan-ip>:8000`) from any phone or tablet on the same Wi-Fi network.
2. Over plain HTTP LAN connections, use **Scan &rsaquo; Take Photo of Code** to decode QR or Code 128 barcodes from a camera photo — or scan printed item QR labels directly with your phone camera to jump to `/#/i/<id>`.

---

## 4. Backups & Upgrades

- **Full Backup**: Go to **Settings &rsaquo; Database & Storage** and click **Download Backup (.zip)** to export `inventory.db`, `photos/`, and `files/`.
- **Safe Upgrade**: Keep your `data/` folder intact and drop in the newer binary; schema migrations apply automatically at startup.
