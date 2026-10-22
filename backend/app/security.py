from fastapi import Depends, HTTPException, status, Cookie
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timedelta
from jose import jwt, JWTError
from passlib.context import CryptContext
from app.config import settings
from app.db import get_db
import hmac
import os
import secrets
import time
from collections import deque

pwd=CryptContext(schemes=["bcrypt"])
def hash_password(p): return pwd.hash(p)
def verify_password(p,h): return pwd.verify(p,h)
def create_token(user_id, role):
    return jwt.encode({"sub":str(user_id),"role":role,"exp":datetime.utcnow()+timedelta(days=30)},settings.jwt_secret,algorithm="HS256")
bearer_scheme = HTTPBearer(auto_error=False)


# --- сессия администратора ---
# Раньше cookie равнялась sha256(пароля): одна и та же у всех, кто знает
# пароль, и не менялась при его смене. Теперь — случайный токен,
# живущий только в памяти процесса, плюс ограничение попыток входа.
ADMIN_SESSION_TTL = 60 * 60 * 12
LOGIN_WINDOW = 300          # 5 минут
LOGIN_MAX_ATTEMPTS = 5

_admin_sessions: dict[str, float] = {}
_login_attempts: dict[str, deque] = {}


def _admin_password() -> str:
    return os.getenv("ADMIN_PASSWORD", "change-me-please")


def _sweep_sessions() -> None:
    now = time.time()
    for token in [t for t, expires in _admin_sessions.items() if expires <= now]:
        del _admin_sessions[token]


def create_admin_session() -> str:
    _sweep_sessions()
    token = secrets.token_urlsafe(32)
    _admin_sessions[token] = time.time() + ADMIN_SESSION_TTL
    return token


def invalidate_admin_session(token: str | None) -> None:
    if token:
        _admin_sessions.pop(token, None)


def admin_session_valid(token: str | None) -> bool:
    if not token:
        return False
    _sweep_sessions()
    return token in _admin_sessions


def login_allowed(client_ip: str) -> bool:
    now = time.time()
    attempts = _login_attempts.setdefault(client_ip, deque())
    while attempts and attempts[0] < now - LOGIN_WINDOW:
        attempts.popleft()
    return len(attempts) < LOGIN_MAX_ATTEMPTS


def register_failed_login(client_ip: str) -> None:
    _login_attempts.setdefault(client_ip, deque()).append(time.time())


def check_admin_password(candidate: str) -> bool:
    """Сравнение за постоянное время (защита от тайминг-атак).

    hmac.compare_digest не принимает строки с не-ASCII (например, кириллицей),
    поэтому сравниваем UTF-8-байты.
    """
    return hmac.compare_digest(
        (candidate or "").encode("utf-8"),
        _admin_password().encode("utf-8"),
    )


def get_admin(admin_session: str | None = Cookie(default=None)):
    if not admin_session_valid(admin_session):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется вход администратора",
        )



def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
):
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется авторизация",
        )

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=["HS256"],
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недействительный токен",
        )

    return {
        "id": payload.get("sub"),
        "role": payload.get("role"),
    }


def get_current_executor(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db=Depends(get_db),
):
    """Текущий исполнитель по токену (выдаётся при подтверждении номера/входе)."""
    from .models import Executor  # локальный импорт: избегаем цикла

    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется авторизация",
        )

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=["HS256"],
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недействительный токен",
        )

    if payload.get("role") != "executor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Токен не для исполнителя",
        )

    try:
        executor_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Некорректный токен",
        )

    executor = db.query(Executor).filter(Executor.id == executor_id).first()
    if not executor:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Исполнитель не найден",
        )
    return executor
