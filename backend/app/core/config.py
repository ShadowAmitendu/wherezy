import os
from pathlib import Path
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
DATA_DIR = Path(os.getenv("DATA_DIR", str(BASE_DIR / "data")))
PHOTOS_DIR = DATA_DIR / "photos"
BACKUPS_DIR = DATA_DIR / "backups"
DB_PATH = DATA_DIR / "inventory.db"
SECRET_KEY = os.getenv("SECRET_KEY", "lan-home-inventory-secret-key-change-in-prod-12345")
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# Ensure directories exist
DATA_DIR.mkdir(parents=True, exist_ok=True)
PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
(PHOTOS_DIR / "item").mkdir(parents=True, exist_ok=True)
(PHOTOS_DIR / "location").mkdir(parents=True, exist_ok=True)
