---
layout: default
title: Desktop & Tray Controller
nav_order: 2
summary: Small native controller window, Windows taskbar/tray, macOS menu bar, and Start with OS.
---

# Desktop & Tray Controller

[&larr; Back to Overview]({{ '/' | relative_url }})

Double-clicking `wherezy.exe` (Windows), `wherezy` (macOS), or running `wherezy-desktop` launches the lightweight native **Wherezy Server Controller** built with **TTK Bootstrap + Tkinter**, paired with a system tray / menu bar icon.

## Server Controls & Status Indicator

- **TTK Bootstrap UI & Theme Switcher**: Styled controls (`round-toggle` switches, Bootstrap status pills, auto-hiding log scrollbar) with persisted live theme selection (`bootstrap-dark`, `bootstrap-light`, `tokyo-night-dark`, `nord-dark`, `catppuccin-dark`, `one-dark`, `dracula-dark`, `minty-light`, and `sandstone-light`).

- **Start / Resume Server**: Boots the embedded Uvicorn + FastAPI server on your configured host, port, and data folder (or instantly un-pauses if paused).
- **Pause Server**: Holds incoming web/API requests cleanly with HTTP `503` (`Retry-After: 5`) without releasing the port or risking mid-write SQLite state.
- **Stop & Restart**: Cleanly stops the embedded server thread or restarts cleanly to apply new host/port bindings.
- **Live Server Logs & Quick Actions**: View live Uvicorn server logs, open Local or LAN URLs in your browser, copy the phone LAN URL, or open your data folder directly.

## Windows Taskbar, Background Apps & macOS Menu Bar

- **Windows**: Displays Wherezy's branded application icon on both the **Windows Taskbar** (`SetCurrentProcessExplicitAppUserModelID`) and the **System Tray / Background Apps** area with a color-coded status dot (**Green** = Running, **Amber** = Paused, **Slate** = Stopped). Closing or hiding minimizes cleanly into the tray.
- **macOS**: Integrates into the native macOS **Menu Bar (`NSStatusBar`)** and Dock, providing quick access to *Show Control Window*, *Open Web Dashboard*, *Start / Pause / Stop / Restart*, *Start with OS*, and *Quit Wherezy*.
- **Single-Instance Wake**: Launching Wherezy a second time while it is running in the tray wakes the existing control window instead of hitting a port conflict.

## Start with OS

Enable **Start with OS** inside the controller window or tray menu to launch Wherezy minimized (`--gui --minimized`) on login:

| OS | Integration Mechanism |
| :--- | :--- |
| Windows | Current-user Run registry key (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`) |
| macOS | Per-user LaunchAgent (`~/Library/LaunchAgents/com.wherezy.desktop.plist`) |
| Linux | XDG Autostart entry (`~/.config/autostart/wherezy.desktop`) |

## Headless / Server CLI Flags

When running on headless servers, Docker, or CI scripts, GUI mode is automatically bypassed whenever server flags or headless mode are passed:

```bash
./wherezy --headless --host 0.0.0.0 --port 8080 --data-dir ./wherezy-data
./wherezy --gui --minimized
wherezy-desktop
```
