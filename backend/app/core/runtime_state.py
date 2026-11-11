"""Thread-safe runtime control state shared between the web server and desktop controller."""

from __future__ import annotations

from html import escape
import threading

DEFAULT_PAUSE_REASON = "Wherezy server is currently paused from the desktop controller."

_lock = threading.RLock()
_paused = False
_pause_reason = DEFAULT_PAUSE_REASON


def is_server_paused() -> bool:
    """Return True when incoming HTTP requests should be held with 503 Paused."""
    with _lock:
        return _paused


def get_pause_reason() -> str:
    """Return the human-readable reason shown while the server is paused."""
    with _lock:
        return _pause_reason


def set_server_paused(paused: bool, reason: str | None = None) -> None:
    """Toggle the server pause gate used by the FastAPI HTTP middleware."""
    global _paused, _pause_reason
    with _lock:
        _paused = bool(paused)
        if reason is not None and reason.strip():
            _pause_reason = reason.strip()
        elif not _paused:
            _pause_reason = DEFAULT_PAUSE_REASON


def build_paused_html(reason: str | None = None) -> str:
    """Render a standalone HTML status page shown to browsers while paused."""
    message = escape(reason or get_pause_reason())
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Wherezy — Server Paused</title>
  <style>
    :root {{ color-scheme: dark light; }}
    body {{
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      padding: 24px;
    }}
    .card {{
      max-width: 460px;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 28px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
    }}
    .badge {{
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-radius: 999px;
      background: rgba(245, 158, 11, 0.16);
      color: #fbbf24;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 14px;
    }}
    h1 {{
      margin: 0 0 10px;
      font-size: 22px;
      line-height: 1.25;
      color: #f8fafc;
    }}
    p {{
      margin: 0;
      font-size: 15px;
      line-height: 1.55;
      color: #cbd5e1;
    }}
  </style>
</head>
<body>
  <main class="card">
    <div class="badge">Paused</div>
    <h1>Wherezy Server Paused</h1>
    <p>{message}</p>
  </main>
</body>
</html>
"""
