---
layout: default
title: Getting Started & Setup
nav_order: 1
summary: Install Wherezy, choose your network/HTTPS mode, change the starter PIN, and organize your home.
---

# Getting Started & First-Run Setup

[&larr; Back to Overview]({{ '/' | relative_url }})

Follow this step-by-step guide to go from download to a working household inventory on your PC and phones.

---

## Step 1: Choose How to Run Wherezy

| Method | Best For | What You Need |
| :--- | :--- | :--- |
| **[Windows Installer]({{ '/downloads/' | relative_url }})** (`Wherezy-Setup-2.2.2.exe`) | Windows 10/11 desktop & laptop users | Nothing pre-installed; zero admin rights needed |
| **[macOS App Bundle]({{ '/downloads/' | relative_url }})** (`Wherezy-2.2.2-macOS.dmg`) | macOS Apple Silicon / desktop users | Drag `Wherezy.app` into Applications |
| **[Linux Bundle / Docker / pipx]({{ '/downloads/' | relative_url }})** | Ubuntu desktops, home servers, NAS boxes | Tarball, Docker Compose, or Python 3.12+ |

> **Source Checkout (Developers):** Clone the repo, install Python dependencies (`pip install -r backend/requirements.txt`), build the React UI (`cd frontend && npm install && npm run build`), and start via `python run.py --open` or `.\.venv\Scripts\python.exe -m backend.app.desktop.app`. See [BUILDING.md](https://github.com/ShadowAmitendu/wherezy/blob/main/BUILDING.md) for packaging instructions.

---

## Step 2: Pick Your Network & Security Mode on First Launch

When the **Wherezy Server Controller** opens for the first time, it starts safely bound to `127.0.0.1:8000` over HTTP so **Windows Firewall does not interrupt you** and local browsers load immediately without self-signed certificate prompts.

A one-time **Network & Firewall Notice** lets you choose:

- **Keep `127.0.0.1` Only (HTTP):** Use Wherezy only on the computer running it (fastest, zero firewall or cert prompts).
- **LAN + HTTPS (Camera Ready):** Binds to `0.0.0.0` so phones/tablets on your home Wi-Fi can connect over encrypted `https://` — unlocks live mobile camera barcode/QR scanning and voice capture.
- **LAN Only (HTTP):** Binds to `0.0.0.0` over plain `http://` (phones can still scan via the **Take Photo of Code** fallback or printed QR deep links).

You can change **Host** (`127.0.0.1` vs `0.0.0.0`), **Port**, and the **Enable HTTPS (TLS)** toggle switch anytime inside **Server & Startup Settings**.

---

## Step 3: Sign In and Change the Starter Admin PIN

Click **Open Web UI** in the Desktop Controller (or click the **This Computer** link) to open the web interface:

1. Select the **Admin** profile and enter the default starter PIN: **`0000`**.
2. Open **Account Profile** (`/account`) or **Settings &rsaquo; Profiles & Security** (`/settings`) and set a strong PIN or password right away.
3. Add profiles for family members (`member` or `viewer`) under **Users** (`/users`) so each person has their own name, avatar, theme, and role permissions. See [Profiles, Roles & HTTPS]({{ '/security-and-profiles/' | relative_url }}).

---

## Step 4: Set Up Your Home Structure

1. **Build Your Rooms & Storage Tree (`/locations`):**
   - Start with rooms (e.g., *Kitchen*, *Garage*, *Medicine Cabinet*, *Store Room*).
   - Nest racks, shelves, cupboards, drawers, or labeled boxes underneath them.
2. **Choose Categories (`/categories`):**
   - Import any of the **[27 built-in starter templates]({{ '/categories/' | relative_url }})** (like *Medicines*, *Documents*, *Tools*, *Cables & Chargers*, or *Festival Supplies*), or create a custom category with tailored fields.
3. **Add or Snap Your First Items (`/items` or `/inbox`):**
   - Add an item directly with location, expiry date, tags, and photos — or drop quick snapshots into the **Quick Capture Inbox** (`/inbox`) to organize later.

---

## Step 5: Connect Phones Over Home Wi-Fi

1. Make sure your controller host is `0.0.0.0` (and enable **Enable HTTPS (TLS)** if you want live camera barcode scanning).
2. Copy the **LAN / Phone** URL shown in the Desktop Controller (`https://<your-pc-ip>:8000` or `http://<your-pc-ip>:8000`) and open it on your phone's browser on the same Wi-Fi network.
3. If HTTPS is enabled with Wherezy's automatic self-signed certificate, accept the browser's one-time *"Proceed"* prompt.

---

## Next Steps

- Learn every workflow in the **[User Guide & Workflows]({{ '/features/' | relative_url }})**
- Print QR/barcode stickers in **[Labels, Barcodes & Scanning]({{ '/labels-and-scanning/' | relative_url }})**
- Configure offline **Ollama / LM Studio** or **Gemini AI** in **[Private AI Workflows]({{ '/ai-workflows/' | relative_url }})**
- Set up automatic backups & inspect data locations in **[CLI, Env & Docker Reference]({{ '/configuration/' | relative_url }})**
