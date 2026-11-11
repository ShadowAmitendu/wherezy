import os
import sys
from pathlib import Path

APP_VERSION = "2.1.0"


def is_frozen() -> bool:
    """Return True when running inside a frozen executable (e.g. PyInstaller)."""
    return bool(getattr(sys, "frozen", False))


def resolve_app_package_dir() -> Path:
    """Return the `backend/app` package directory across source, wheel, and frozen runs."""
    return Path(__file__).resolve().parent.parent


def resolve_repo_root(app_pkg_dir: Path | None = None) -> Path | None:
    """Return the repository root when running from a source checkout, else None."""
    pkg = app_pkg_dir or resolve_app_package_dir()
    candidate = pkg.parent.parent
    if (candidate / "backend" / "app").is_dir() and (
        (candidate / "run.py").is_file() or (candidate / "frontend").is_dir()
    ):
        return candidate
    return None


def resolve_bundle_dir() -> Path:
    """Return the read-only bundle root holding packed resources and assets."""
    if is_frozen():
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            return Path(meipass).resolve()
        return Path(sys.executable).resolve().parent
    repo_root = resolve_repo_root()
    if repo_root is not None:
        return repo_root
    return resolve_app_package_dir()


def resolve_frontend_dist(
    bundle_dir: Path | None = None,
    app_pkg_dir: Path | None = None,
) -> Path:
    """Locate the built frontend `dist` directory (PyInstaller bundle, source checkout, or wheel static_dist)."""
    b_dir = bundle_dir or resolve_bundle_dir()
    pkg_dir = app_pkg_dir or resolve_app_package_dir()
    candidates = [
        b_dir / "frontend" / "dist",
        b_dir / "static_dist",
        pkg_dir / "static_dist",
    ]
    for candidate in candidates:
        if (candidate / "index.html").is_file():
            return candidate
    return candidates[0]


def resolve_default_data_dir() -> Path:
    """Resolve persistent writable data directory outside ephemeral bundle temp dirs."""
    env_data = os.getenv("WHEREZY_DATA_DIR") or os.getenv("DATA_DIR")
    if env_data:
        return Path(env_data).expanduser().resolve()
    if is_frozen():
        return Path(sys.executable).resolve().parent / "data"
    repo_root = resolve_repo_root()
    if repo_root is not None:
        return repo_root / "data"
    return Path.home() / ".wherezy" / "data"


def ensure_data_dirs(data_dir: Path) -> None:
    """Create persistent writable storage subdirectories."""
    photos_dir = data_dir / "photos"
    data_dir.mkdir(parents=True, exist_ok=True)
    photos_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "files").mkdir(parents=True, exist_ok=True)
    (data_dir / "backups").mkdir(parents=True, exist_ok=True)
    (photos_dir / "item").mkdir(parents=True, exist_ok=True)
    (photos_dir / "location").mkdir(parents=True, exist_ok=True)


APP_PACKAGE_DIR = resolve_app_package_dir()
BUNDLE_DIR = resolve_bundle_dir()
BASE_DIR = resolve_repo_root(APP_PACKAGE_DIR) or BUNDLE_DIR
MIGRATIONS_DIR = APP_PACKAGE_DIR / "migrations"
TEMPLATES_DIR = APP_PACKAGE_DIR / "seed_templates"
FRONTEND_DIST = resolve_frontend_dist(BUNDLE_DIR, APP_PACKAGE_DIR)

DATA_DIR = resolve_default_data_dir()
PHOTOS_DIR = DATA_DIR / "photos"
FILES_DIR = DATA_DIR / "files"
BACKUPS_DIR = DATA_DIR / "backups"
DB_PATH = DATA_DIR / "inventory.db"
SECRET_KEY = os.getenv("WHEREZY_SECRET_KEY") or os.getenv(
    "SECRET_KEY",
    "lan-home-inventory-secret-key-change-in-prod-12345",
)
HOST = os.getenv("WHEREZY_HOST") or os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("WHEREZY_PORT") or os.getenv("PORT", "8000"))

# Ensure directories exist
ensure_data_dirs(DATA_DIR)

