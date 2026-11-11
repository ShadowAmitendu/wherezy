---
layout: default
title: Private AI Workflows
nav_order: 4
summary: Optional 100% offline Ollama / LM Studio / llama.cpp models or encrypted Google Gemini API workflows.
---

# Private AI Assistant (Local LLM or Gemini API)

[&larr; Back to Overview]({{ '/' | relative_url }})

Wherezy never requires AI to work — and when you do enable it, **you choose** whether data stays 100% inside your LAN using a **Local LLM** or uses your own **Google Gemini API** key.

---

## Option A: 100% Offline Local LLM (Ollama, LM Studio, `llama.cpp`)

All text, vision, and optional speech-to-text prompts stay inside your local network:

1. **Start your local AI runtime** (on the same PC or another machine on your LAN):
   - **[Ollama](https://ollama.com):** Default OpenAI-compatible URL `http://127.0.0.1:11434/v1` (pull a chat or vision model such as `qwen2.5:7b` or `qwen2.5vl:7b`).
   - **LM Studio:** Enable the Local Server at `http://127.0.0.1:1234/v1`.
   - **`llama.cpp` server:** Start HTTP server at `http://127.0.0.1:8080/v1`.
2. In Wherezy, open **Settings &rsaquo; AI Assistant Provider** (`/settings`).
3. Choose **Local LLM (Ollama / LM Studio / Custom)** and click the quick preset chip (**Ollama**, **LM Studio**, or **llama.cpp**).
4. Click **Fetch Models** to populate installed models from your local server.
5. *(Optional)* Enter a local Whisper STT model name (such as `whisper-1`) if your OpenAI-compatible server provides `/audio/transcriptions` for voice recording.
6. Click **Test Connection** &rarr; **Save AI Settings**.

> **Live Microphone Note:** In browsers over LAN Wi-Fi, microphone voice capture requires a Secure Context — turn on **Enable HTTPS (TLS)** in the Desktop Controller if recording voice from a phone or second laptop.

---

## Option B: Google Gemini API Key

1. Open **Settings &rsaquo; AI Assistant Provider** (`/settings`).
2. Choose **Cloud API Key (Gemini)**, paste your Gemini API key, select a model, and click **Test Connection** &rarr; **Save AI Settings**.
   - Saved API keys are encrypted at rest inside SQLite using Fernet symmetric encryption derived from `WHEREZY_SECRET_KEY` / `SECRET_KEY`.
3. Alternatively, pass `GEMINI_API_KEY` (and optionally `WHEREZY_GEMINI_MODEL`) as environment variables — see [CLI, Env & Docker Reference]({{ '/configuration/' | relative_url }}).

---

## Supported AI Workflows Inside Wherezy

| Where | What AI Helps With | Input Supported |
| :--- | :--- | :--- |
| **Category Builder** (`/categories`) | Generates category name, icon recommendation, and tailored custom schema fields | Natural-language prompt or voice note |
| **Item Add / Detail** (`/items`) | Extracts structured item name, description, expiry, and custom fields cleanly | Item photo, receipt snapshot, text, or voice |
| **Bulk Add Dialog** (`/items`) | Splits multi-item descriptions or shelf photos into multiple structured drafts in one batch | List text or group photo |
| **Quick Capture Inbox** (`/inbox`) | Suggests best matching category, field values, and storage location from Inbox snapshots | Existing Inbox capture |
| **Location Tree Generator** (`/locations`) | Scaffolds nested rooms, racks, shelves, and bin hierarchies from a home layout description | Text description |
