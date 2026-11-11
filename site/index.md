---
layout: default
title: Overview
permalink: /
---

# Wherezy v2.2.2

**Know where everything lives at home — in seconds.**

Wherezy is an open-source, self-hosted household inventory system built for speed, privacy, and everyday practicality inside your own home network. Run it via the one-click **Windows/macOS Desktop App**, **Docker**, or **Python CLI** — with **zero telemetry**, bundled offline fonts, local SQLite storage, printable QR/Code 128 labels, phone scanning, multi-member PIN profiles, and optional AI assistance powered by a local LLM or Gemini.

---

## Why Wherezy?

- **100% Local & Private**: Your database, item photos, PDF receipts, and encrypted AI keys stay on your own computer or NAS — no cloud account or subscription needed.
- **Built Around Real Household Storage**: Model rooms, cupboards, racks, shelves, boxes, and seasonal bins with custom per-category fields and **27 starter category templates**.
- **Works Across Desktop & Phones**: Manage everything from a PC browser, print sticker label sheets or paper clipboard audits, and scan items from phones over Wi-Fi (with built-in optional **HTTPS/TLS**).
- **Safe for Non-Technical Families**: Per-user Windows installer (no admin prompt), visual system tray controller, multi-user profile switcher, 10-second Undo snackbars, activity rollback, and one-click `.zip` backups.

---

## Quick Start in 60 Seconds

- **Windows Desktop**: Download [Wherezy-Setup-2.2.2.exe](https://github.com/ShadowAmitendu/wherezy/releases/latest/download/Wherezy-Setup-2.2.2.exe), run the per-user installer, sign in as **Admin** with starter PIN `0000`, and change your PIN.
- **macOS Desktop**: Open [Wherezy-2.2.2-macOS.dmg](https://github.com/ShadowAmitendu/wherezy/releases/latest/download/Wherezy-2.2.2-macOS.dmg), drag **Wherezy.app** into **Applications**, and launch from the Menu Bar.
- **Docker / Home Server**: Run `docker compose up -d --build` (persists state in the `/data` volume on port `8000`).
- **From Source**: Check [Getting Started & Setup]({{ '/instructions/' | relative_url }}) or the repository [README](https://github.com/ShadowAmitendu/wherezy).

---

## How Wherezy Works

1. **Create Your Spaces**: Add rooms and nested storage containers (`Garage > Rack B > Shelf 2 > Electrical Bin`).
2. **Pick Categories**: Start from 27 templates (**Medicines**, **Tools**, **Documents**, **Festival Supplies**, **Cables**, etc.) or design custom fields.
3. **Add or Quick-Capture Items**: Enter items manually, bulk-import CSV/JSON/XLSX, snap photos into the Quick Capture Inbox, or extract details with AI.
4. **Print Labels & Audit Sheets**: Print `I<id>` / `L<id>` QR + Code 128 barcode sticker sheets or shelf checklists.
5. **Find, Scan & Track**: Filter by expiry/taken-out status, scan codes from your phone, lend tools to contacts, and restore safely anytime.

---

## Documentation Guide

{% assign doc_pages = site.docs | sort: "nav_order" %}
{% for doc in doc_pages %}
- **[{{ doc.title }}]({{ doc.url | relative_url }})** — {{ doc.summary }}
{% endfor %}

---

## Quick Downloads (`v2.2.2`)

| Platform / Format | Package | Install / Launch |
| :--- | :--- | :--- |
| Windows (`x86_64` Installer) | [Wherezy-Setup-2.2.2.exe](https://github.com/ShadowAmitendu/wherezy/releases/latest/download/Wherezy-Setup-2.2.2.exe) | Per-user installer (no admin needed), Start Menu, Tray & optional autostart |
| macOS (`.dmg`) | [Wherezy-2.2.2-macOS.dmg](https://github.com/ShadowAmitendu/wherezy/releases/latest/download/Wherezy-2.2.2-macOS.dmg) | Drag `Wherezy.app` to Applications; includes Menu Bar Controller |
| Linux (`x86_64`) | [wherezy-2.2.2-linux-x86_64.tar.gz](https://github.com/ShadowAmitendu/wherezy/releases/latest/download/wherezy-2.2.2-linux-x86_64.tar.gz) | Extract & run `./Wherezy/wherezy --open` |
| Python Wheel (`pipx`) | [wherezy-2.2.2-py3-none-any.whl](https://github.com/ShadowAmitendu/wherezy/releases/latest/download/wherezy-2.2.2-py3-none-any.whl) | `pipx install ...` -> `wherezy` or `wherezy-desktop` |
| Checksums | [SHA256SUMS.txt](https://github.com/ShadowAmitendu/wherezy/releases/latest/download/SHA256SUMS.txt) | Verify download integrity |

See [Downloads & Upgrades]({{ '/downloads/' | relative_url }}) for installation details, SmartScreen/macOS quarantine tips, and upgrade steps.

---

## License & Source Code

Wherezy is released under the **MIT License**. Browse the source code, inspect [CLI, Env & Docker Reference]({{ '/configuration/' | relative_url }}), or report issues on [GitHub](https://github.com/ShadowAmitendu/wherezy).
