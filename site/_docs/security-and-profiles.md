---
layout: default
title: Profiles, Roles & HTTPS
nav_order: 5
summary: Household profiles, role permissions, wallboard mode, EXIF privacy, and built-in local HTTPS.
---

# Household Profiles, Permissions & HTTPS Security

[&larr; Back to Overview]({{ '/' | relative_url }})

Wherezy is built for shared homes and teams: separate people get their own profiles, kitchen tablets get a locked-down display mode, photos are scrubbed of camera GPS tags, and local Wi-Fi traffic can be encrypted with built-in HTTPS.

---

## 1. Household Profiles & Roles

When you start for the first time, log in with the default **`Admin`** profile using PIN **`0000`**.

> **Important:** Change the default **`0000`** Admin PIN immediately after logging in (**Settings** &rarr; **Profiles** / **Change PIN**), especially before enabling LAN access (`0.0.0.0`).

| Role | Built-In Access Scope | Best For |
| :--- | :--- | :--- |
| **`admin`** | Full system control: profiles, permissions, backups/restore, AI keys, settings, and all inventory actions | Household owner / primary maintainer |
| **`co_admin`** | Manages inventory, locations, categories, household members, and reports without full system Admin actions | Partner / co-organizer |
| **`member`** | Adds, edits, moves, lends/returns items, uses Inbox/Scanner/AI helpers | Everyday household members |
| **`viewer`** | Read-only browsing, searching, and barcode/QR lookup; cannot add, modify, or delete data | Kids, guests, or lookup-only devices |
| **`custom`** | Starts with `viewer` read baseline plus only the specific permission grants chosen for that profile | Granular team or helper accounts |
| **Display Profile** (`is_display`) | Locked to **Kitchen Wallboard** (`wall:read` and current profile check only); cannot view inventory lists or mutate data | Mounted wall tablets |

### Kitchen Wallboard (`/wall`) & Quick Lock (`/lock`)

- **Wallboard (`/wall`):** Designed for always-on kitchen or hallway tablets running a **Display** profile. Shows overdue and upcoming reminders plus currently taken-out items while **stripping all borrower phone numbers** (`borrower_phone` is always omitted).
- **Quick Switcher (`/lock`):** Switch active household profiles cleanly on shared devices without closing tabs.

---

## 2. Authentication, Sessions & Privacy

- **PIN Hashing:** Profile PINs are salted and hashed with **bcrypt** before hitting SQLite.
- **Brute-Force Rate Limiting:** After **5 failed login attempts within 60 seconds** from the same IP address, Wherezy temporarily blocks login attempts (`HTTP 429 RATE_LIMITED`) until the 1-minute cooldown clears.
- **Signed Sessions:** Web browsers receive an `HttpOnly`, `SameSite=Lax` signed cookie (`hi_session`, valid for 30 days). When accessed over HTTPS (directly or behind an `X-Forwarded-Proto: https` reverse proxy), Wherezy automatically marks the session cookie **`Secure`**. Programmatic API clients can also pass `Authorization: Bearer <token>` or `X-Session-Token`.
- **Automatic EXIF & GPS Removal:** Every uploaded photo (up to **15 MB**, JPEG/PNG/WEBP/MPO) is auto-oriented using EXIF rotation, stripped of all camera EXIF/GPS metadata, resized to at most **2000 px**, and paired with a **400 px** JPEG thumbnail.
- **Encrypted AI Keys:** Gemini API keys saved through the Settings UI are encrypted at rest with Fernet before being stored in SQLite (or can be injected purely in-memory via `GEMINI_API_KEY`).

---

## 3. Built-In HTTPS for Local Wi-Fi

Modern phone browsers block live camera barcode scanning and microphone recording on plain HTTP LAN addresses (`http://192.168.x.x`), allowing `navigator.mediaDevices` only on `localhost` or `https://`.

Wherezy includes built-in TLS certificate management so you can run `https://` cleanly on home Wi-Fi with zero manual OpenSSL steps.

### First-Run Choice in the Desktop App

On first launch, Wherezy defaults safely to **`127.0.0.1` over HTTP** (accessible only on the host PC, with no Windows Firewall prompt and no certificate warning). The **Network & Firewall Notice** banner lets you pick your setup with one click:

1. **Keep 127.0.0.1 Only:** Best if you only use Wherezy on that computer.
2. **LAN + HTTPS (Camera Ready):** Binds to `0.0.0.0` so phones and tablets on Wi-Fi can connect, and enables HTTPS automatically so phone camera scanning works.
3. **LAN Only (HTTP):** Exposes `0.0.0.0` over plain HTTP (you can still scan using **Take/Upload Photo** fallback or URL QR codes).

### How Built-In Self-Signed Certificates Work

When HTTPS is enabled without custom `--ssl-certfile` / `--ssl-keyfile` paths, Wherezy automatically generates a local TLS keypair:

- **Algorithm & Validity:** RSA-2048 X.509 certificate signed with SHA-256, valid for **800 days** (automatically renewed within 30 days of expiration or whenever your machine's detected LAN IP changes).
- **Subject Alternative Names (SANs):** Automatically populated with `localhost`, `127.0.0.1`, `::1`, your active local LAN IPv4 address, hostname, and `<hostname>.local`.
- **Storage Location:** Saved under `%LOCALAPPDATA%\Wherezy\certs\wherezy-cert.pem` and `wherezy-key.pem` on Windows (or your OS user data `certs/` directory, with `0600` private key permissions on macOS/Linux). Overridable via `WHEREZY_CERT_DIR`.
- **SHA-256 Verification:** The Desktop Controller and CLI startup banner display the certificate's **TLS SHA-256 fingerprint** so you can verify you are connecting to your own server the first time you accept the browser's self-signed certificate prompt.

> **One-time browser warning on self-signed HTTPS:** Because the certificate is generated locally on your computer rather than issued by a public Certificate Authority, browsers show a **"Your connection is not private"** prompt the first time each device connects. Click **Advanced &rarr; Proceed** once per browser/phone, or see below for custom trusted certificates.

---

## 4. Using Your Own Certificate or Reverse Proxy

If you already terminate TLS on your home network (for example with **Caddy**, **Nginx**, **Traefik**, or **Tailscale Serve**), or generate trusted local certs with **mkcert**:

- **Direct Custom PEM Files:** Pass `--ssl-certfile /path/to/cert.pem --ssl-keyfile /path/to/key.pem` (or set `WHEREZY_SSL_CERTFILE` and `WHEREZY_SSL_KEYFILE`). Passing cert/key paths implies HTTPS automatically.
- **Reverse Proxy:** Leave Wherezy listening on plain HTTP (`127.0.0.1:8000` or Docker `8000`) behind your proxy and ensure the proxy sends `X-Forwarded-Proto: https` so Wherezy marks session cookies `Secure`.
- **Disable HTTPS at Any Time:** Uncheck **Use HTTPS** in the Desktop Controller, pass `--no-https` on CLI, or set `WHEREZY_HTTPS=0`.

---

## Next Steps

- [Desktop & Tray Controller]({{ '/desktop-controller/' | relative_url }}) &mdash; manage Start/Stop, host binding, and HTTPS from the tray
- [CLI, Env & Docker Reference]({{ '/configuration/' | relative_url }}) &mdash; deploy behind a proxy or headless Linux server
- [Troubleshooting & FAQ]({{ '/troubleshooting/' | relative_url }}) &mdash; resolve certificate prompts or firewall popups
