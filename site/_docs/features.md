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
- **QR Codes, Barcodes & Audit Sheets**: Generate printable `I<id>` / `L<id>` QR and Code 128 label sheets (3x8, 4x10, continuous roll) and compact A4/Letter shelf audit checklists. Decode over LAN via live camera, photo snapshot fallback on plain HTTP, or USB/Bluetooth scanners.
- **Household Profiles, AuthGuard & RBAC**: Multi-user switcher with bcrypt PIN authentication, route/action guards (`admin`, `co_admin`, `member`, `viewer`, `display`), and custom uploaded profile pictures.
- **10-Second Undo Snackbars**: Reversible deletes, status toggles, and moves show a live countdown progress bar allowing one-click undo before permanent commit.
- **Private Multimodal AI**: Run offline via **Ollama**, **LM Studio**, or OpenAI-compatible local servers (including optional Whisper voice transcription) or use **Google Gemini API** (Fernet-encrypted credentials at rest) to generate schemas, extract items from photos/voice, triage Inbox captures, and scaffold location trees.
- **Backup, Export & Import**: One-click `.zip` backups (`inventory.db` + `photos/` + `files/`), automatic pre-restore safety snapshots, and dropdown multi-format **Export & Import** (CSV, JSON, and Excel `.xlsx`).

## Next in Collection

- [Desktop & Tray Controller &rarr;]({{ '/desktop-controller/' | relative_url }})
- [Downloads &rarr;]({{ '/downloads/' | relative_url }})
