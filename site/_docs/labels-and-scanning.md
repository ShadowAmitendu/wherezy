---
layout: default
title: Labels, Barcodes & Scanning
nav_order: 3
summary: Print QR + Code 128 sticker sheets, clipboard audit sheets, and scan from phones or USB readers.
---

# QR Codes, Barcode Labels & Mobile Scanning

[&larr; Back to Overview]({{ '/' | relative_url }})

Wherezy gives every physical item and storage container a compact scannable identity (`I<id>` for items, `L<id>` for locations) so looking up a box or item in a closet takes one scan.

---

## 1. Identifier Codes (`I<id>` & `L<id>`)

| Prefix | Example | Resolves To | Printed Label Displays |
| :--- | :--- | :--- | :--- |
| **`I`** | `I26` | Item detail view (`/#/i/26`) | Item name, location breadcrumb, QR code + Code 128 barcode |
| **`L`** | `L12` | Location view (`/#/l/12`) | Storage location name, parent room path, QR code + Code 128 barcode |

---

## 2. Printing Sticker Label Sheets (`/labels`)

Open **Labels** (`/labels`) from items, locations, or the navigation bar to print physical stickers:

- **Dual-Code Output:** Each label renders both a **QR code** (for phone cameras and visual scans) and a crisp **Code 128 barcode** (ideal for handheld 1D/USB barcode scanners), sized dynamically per preset — including multi-copy printing across every label on a sheet.
- **Sticker & Thermal Presets:**
  - Standard A4/Letter grids (e.g., 3x8, 4x10 sheets)
  - Compact / thermal label presets (such as `Small (40 x 20 mm)`)
  - **Copies selector:** Print multiple identical labels cleanly across sheets or continuous rolls.

---

## 3. Printable Shelf Audit Checklists (`/print/location/:id`)

Before doing a physical garage, pantry, or medicine-cabinet check, open any location and click **Print Shelf Audit Sheet** (`/print/location/:id`):
- Formats a clean **A4 / Letter** print view with high-contrast checkboxes, item thumbnails, custom details, and QR codes.
- Walk the room with a pen and clipboard, or scan items afterward to update missing or borrowed entries.

---

## 4. Three Ways to Scan (`/scan`)

### Mode A: Live Phone Camera Scanner *(Recommended over Wi-Fi HTTPS)*
1. Enable **LAN + HTTPS (Camera Ready)** in the first-run notice, or set Host to `0.0.0.0` and turn on **Enable HTTPS (TLS)** in the Desktop Controller (or start CLI with `--https`).
2. Open Wherezy on your phone at `https://<your-pc-ip>:8000` (accept the one-time local self-signed certificate prompt in Chrome/Safari).
3. Go to **Scan** (`/scan`) — modern mobile browsers receive a **Secure Context** (`window.isSecureContext`) and grant live video camera access to decode QR codes and Code 128 barcodes continuously.

> **Why HTTPS?** Mobile Safari (iOS) and Chrome (Android) block live camera streaming (`getUserMedia`) on non-`localhost` plain HTTP URLs. Wherezy includes built-in local HTTPS specifically so live phone scanning works on home Wi-Fi with zero third-party setup.

### Mode B: Photo Capture Fallback *(Works on Plain HTTP)*
If you run over plain `http://<your-pc-ip>:8000`, tap **"Take a Photo"** on the Scan screen. Your phone takes a still photo via the OS camera picker and Wherezy decodes the QR or barcode immediately without needing HTTPS.

### Mode C: Native Camera Deep Links & USB / Bluetooth Scanners
- **Native Phone Camera:** Point your default iPhone/Android camera app at a printed QR code — it opens `https://<ip>:8000/#/i/<id>` or `/#/l/<id>` straight to the item or bin.
- **USB / Bluetooth Barcode Scanner:** Open **Scan** (`/scan`) and focus the code input box — hardware wedge scanners type `I26` + Enter instantly.
