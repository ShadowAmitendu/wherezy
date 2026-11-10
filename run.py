"""
HomeInventory Server Launcher
Run with:
    python run.py
or:
    python run.py --port 8080 --reload --open
"""
import sys
import socket
import argparse
import webbrowser
from pathlib import Path

# Ensure project root is in sys.path
ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

def get_lan_ip() -> str:
    """Detect LAN IPv4 address for opening from phone/tablet on Wi-Fi."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def main():
    parser = argparse.ArgumentParser(description="Start the HomeInventory server.")
    parser.add_argument("--host", default="0.0.0.0", help="Host to listen on (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on (default: 8000)")
    parser.add_argument("--reload", dest="reload", action="store_true", default=True, help="Enable auto-reload on code change (default: enabled)")
    parser.add_argument("--no-reload", dest="reload", action="store_false", help="Disable auto-reload")
    parser.add_argument("--open", action="store_true", help="Automatically open browser on start")
    args = parser.parse_args()

    # Check frontend build
    frontend_dist = ROOT_DIR / "frontend" / "dist" / "index.html"
    if not frontend_dist.exists():
        print("\n[WARNING] Frontend not built! (frontend/dist/index.html not found)")
        print("          Run 'npm --prefix frontend run build' to bundle the web UI.\n")

    lan_ip = get_lan_ip()
    port = args.port

    print("=" * 60)
    print("   📦 HomeInventory Server Starting")
    print("=" * 60)
    print(f"   Local Computer:   http://localhost:{port}")
    if lan_ip != "127.0.0.1":
        print(f"   Mobile / Wi-Fi:   http://{lan_ip}:{port}")
    print("=" * 60)
    print("   Press CTRL+C to stop the server\n")

    if args.open:
        webbrowser.open(f"http://localhost:{port}")

    import uvicorn
    uvicorn.run(
        "backend.app.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        reload_dirs=[str(ROOT_DIR / "backend")] if args.reload else None,
        log_level="info",
    )

if __name__ == "__main__":
    main()
