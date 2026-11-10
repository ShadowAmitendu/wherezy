import time
from collections import defaultdict
from typing import Optional, Dict
import bcrypt
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from backend.app.core.config import SECRET_KEY

serializer = URLSafeTimedSerializer(SECRET_KEY, salt="homeinventory-session")

# Rate limiting for PIN login: max 5 failed attempts per minute per IP
MAX_FAILED_ATTEMPTS = 5
WINDOW_SECONDS = 60
_failed_attempts: Dict[str, list[float]] = defaultdict(list)

def hash_pin(pin: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pin.encode("utf-8"), salt).decode("utf-8")

def verify_pin(pin: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pin.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def create_session_token(data: dict) -> str:
    return serializer.dumps(data)

def verify_session_token(token: str, max_age: int = 86400 * 30) -> Optional[dict]:
    try:
        return serializer.loads(token, max_age=max_age)
    except (BadSignature, SignatureExpired):
        return None

def is_rate_limited(ip: str) -> bool:
    now = time.time()
    attempts = [t for t in _failed_attempts[ip] if now - t < WINDOW_SECONDS]
    _failed_attempts[ip] = attempts
    return len(attempts) >= MAX_FAILED_ATTEMPTS

def record_failed_attempt(ip: str):
    _failed_attempts[ip].append(time.time())

def clear_failed_attempts(ip: str):
    _failed_attempts.pop(ip, None)
