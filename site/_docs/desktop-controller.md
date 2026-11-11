---
layout: default
title: Desktop & Tray Controller
nav_order: 2
summary: Small native controller window, Windows taskbar/tray, macOS menu bar, and Start with OS.
---

# Desktop & Tray Controller

[&larr; Back to Overview]({{ '/' | relative_url }})

Launch Wherezy from the Windows Start Menu / `Wherezy.exe`, macOS `/Applications/Wherezy.app`, or `wherezy-desktop` to open the native **Wherezy Server Controller** built with **TTK Bootstrap + Tkinter**, paired with a system tray / menu bar icon.

## Server Controls, Port Recovery & Status Indicator

- **TTK Bootstrap UI & Theme Switcher**: Styled controls (`round-toggle` switches, Bootstrap status pills, auto-hiding log scrollbar) with persisted live theme selection (`bootstrap-dark`, `bootstrap-light`, `tokyo-night-dark`, `nord-dark`, `catppuccin-dark`, `one-dark`, `dracula-dark`, `minty-light`, and `sandstone-light`).

- **Start / Resume Server**: Boots the embedded Uvicorn + FastAPI server on your configured host, port, and data folder (or instantly un-pauses if paused).
- **Pause Server**: Holds incoming web/API requests cleanly with HTTP `503` (`Retry-After: 5`) without releasing the port or risking mid-write SQLite state.
- **Stop & Restart**: Cleanly stops the embedded server thread or restarts cleanly to apply new host, port, or TLS settings.
- **Port-in-Use Recovery**: If the configured port is busy, displays a clear notice with a one-click **Pick a Free Port & Start** recovery button.
- **Live Server Logs & Quick Actions**: View live Uvicorn server logs (also written to rotating files under `%LOCALAPPDATA%\Wherezy\logs\`), open Local or LAN URLs in your browser, copy the phone LAN URL, or open your data folder directly.

## Network Defaults & Optional HTTPS (TLS)

- **Safe Local Default (`127.0.0.1` HTTP)**: Defaults to local loopback over HTTP so Windows Defender Firewall won't prompt on first run and localhost browsers have zero certificate warnings.
- **First-Run Network & Firewall Notice**: Choose **Keep 127.0.0.1 Only**, **LAN + HTTPS (Camera Ready)** (`0.0.0.0` + HTTPS), or **LAN Only (HTTP)**.
- **Optional HTTPS (TLS) Toggle**: Flip **Enable HTTPS (TLS)** anytime in Settings (or pass `--https`) to encrypt local and LAN traffic using an auto-generated X.509 certificate (`localhost`, `127.0.0.1`, `::1`, machine hostname, and active LAN IPv4 — automatically renewed if your LAN IP changes). Cookies set `Secure` automatically when served over HTTPS, and custom PEM certificates are supported via `--ssl-certfile` / `--ssl-keyfile`.

## Per-User Storage & Windows Taskbar / macOS Menu Bar

- **User Data & Config Locations** *(never stored inside the install folder)*:
  - **Windows**: `%LOCALAPPDATA%\Wherezy\` (`desktop.json`, `data\`, `logs\`, `certs\`)
  - **macOS**: `~/Library/Application Support/Wherezy/`
  - **Linux**: `~/.config/wherezy/` and `~/.local/share/wherezy/`
- **Windows**: Displays Wherezy's branded application icon on both the **Windows Taskbar** (`SetCurrentProcessExplicitAppUserModelID`) and the **System Tray / Background Apps** area with a color-coded status dot (**Green** = Running, **Amber** = Paused, **Slate** = Stopped). Closing or hiding minimizes cleanly into the tray.
- **macOS**: Runs as a menu-bar (`LSUIElement`) app integrating into **NSStatusBar** and Dock with *Show Control Window*, *Open Web Dashboard*, *Start / Pause / Stop / Restart*, *Start with OS*, and *Quit Wherezy*.
- **Single-Instance Wake & Graceful Quit**: Launching Wherezy while running focuses the existing window; running `Wherezy.exe --quit` asks the active instance to shut down cleanly (used automatically during installer upgrades and uninstalls).

## Start with OS

Enable **Start with OS** inside the controller window, tray menu, or installer task to launch Wherezy minimized (`--gui --minimized`) on login:

| OS | Integration Mechanism |
| :--- | :--- |
| Windows | Current-user Run registry key (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`) |
| macOS | Per-user LaunchAgent (`~/Library/LaunchAgents/com.wherezy.desktop.plist`) |
| Linux | XDG Autostart entry (`~/.config/autostart/wherezy.desktop`) |

## Headless & Automation CLI Flags

```bash
Wherezy.exe --headless --host 0.0.0.0 --port 8080 --https
Wherezy.exe --headless --ssl-certfile ./cert.pem --ssl-keyfile ./key.pem
Wherezy.exe --gui --minimized --https
Wherezy.exe --quit
Wherezy.exe --enable-autostart
wherezy-desktop
```
