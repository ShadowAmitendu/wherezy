---
layout: default
title: Features
nav_order: 1
summary: Custom schemas, location trees, QR/barcode labels, AI workflows, RBAC, and backups.
---

# What Wherezy Does

[&larr; Back to Overview]({{ '/' | relative_url }})

Wherezy pairs a React + Material UI LAN web app with a zero-telemetry SQLite WAL backend so everything stays inside your home network.

## Core Capabilities

- **Category Custom Form Builder**: Design per-category schemas using drag-and-drop fields (`text`, `longtext`, `number` with units, `date`, `dropdown`, `multiselect`, `checkbox`) plus [27 built-in starter templates]({{ '/categories/' | relative_url }}).
- **Room & Storage Hierarchy**: Nest rooms, cupboards, racks, shelves, boxes, and standalone storage areas with cycle prevention, move collision guards, and batch item moves.
- **Taken-Out & Expiry Tracking**: Track physical items (`In Place` vs. `Currently Taken Out` with borrower details) and monitor upcoming/expired dates within configurable warning windows.
- **Photos & Attachments with Privacy**: Attach photos and PDFs/receipts to items and locations; automatically strips EXIF GPS metadata, fixes orientation, and builds 256px thumbnails.
- **QR Codes, Barcodes & Audit Sheets**: Generate printable `I<id>` / `L<id>` QR and Code 128 label sheets (3x8, 4x10, continuous roll) and compact A4/Letter shelf audit checklists. Decode over LAN via live camera (when HTTPS is enabled), photo snapshot fallback on plain HTTP, or USB/Bluetooth scanners.
- **Household Profiles, AuthGuard & RBAC**: Multi-user switcher with bcrypt PIN authentication (`Secure` cookies automatically enabled over HTTPS), route/action guards (`admin`, `co_admin`, `member`, `viewer`, `display`), and custom uploaded profile pictures.
- **Built-in Optional HTTPS / TLS**: Toggle **Enable HTTPS (TLS)** in the Desktop Controller or pass `--https` to generate and maintain an 800-day local SAN certificate covering `localhost` and your active LAN IP (or supply your own PEM certificate via `--ssl-certfile` / `--ssl-keyfile`).
- **10-Second Undo Snackbars**: Reversible deletes, status toggles, and moves show a live countdown progress bar allowing one-click undo before permanent commit.
- **Private Multimodal AI**: Run offline via **Ollama**, **LM Studio**, or OpenAI-compatible local servers (including optional Whisper voice transcription) or use **Google Gemini API** (Fernet-encrypted credentials at rest) to generate schemas, extract items from photos/voice, triage Inbox captures, and scaffold location trees.
- **Per-User Desktop Installer, Upgrades & Backups**: Install cleanly without admin rights on Windows (`Wherezy-Setup-2.2.2.exe`) or macOS (`Wherezy-2.2.2-macOS.dmg`); user data is stored safely outside the install folder with automatic pre-migration SQLite backups, one-click `.zip` backups, and CSV/JSON/Excel `.xlsx` export & import.

## Next in Collection

- [Desktop & Tray Controller &rarr;]({{ '/desktop-controller/' | relative_url }})
- [Downloads &rarr;]({{ '/downloads/' | relative_url }})
