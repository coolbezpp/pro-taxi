"""Вебхук MAX и геопозиция исполнителя через чат бота.

Контекст: GPS внутри вебвью MAX заблокирован самим приложением (проверено
на живом Android: navigator.geolocation мгновенно отдаёт code=1, SDK не
знает права location), а вот «поделиться геопозицией» в чате бота
работает. Поэтому место исполнителя добывается так:

1. Миниапп шлёт POST /api/max/geo-request (Bearer-токен исполнителя) —
   бот отправляет пользователю сообщение с кнопкой request_geo_location.
2. Исполнитель жмёт «Поделиться» в чате с ботом (MAX сам даёт нативный
   диалог геолокации — мессенджер, не вебвью).
3. MAX присылает вебхук POST /api/max/webhook/{bot} с событием
   message_created и вложением location — координаты пишутся в
   last_lat/last_lon исполнителя.
4. Миниапп при каждом открытии (и по refreshMe каждые 15 сек) читает
   сохранённую точку из профиля — покидать миниапп больше не нужно.

Подписка (POST /platform-api2.max.ru/subscriptions) пересоздаётся при
каждом старте api: MAX сбрасывает её при перезапуске бота. Проверка
подлинности — заголовок X-Max-Bot-Api-Secret (секрет подписки).
"""

import logging
import secrets
import urllib.request

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwt, JWTError
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Executor
from ..security import bearer_scheme, ensure_executor_session
from ..services.max_notify import _SSL_CTX, send_max_message

import json

router = APIRouter(prefix="/api/max", tags=["max-hook"])

_log = logging.getLogger("pro.maxhook")

MAX_API = "https://platform-api2.max.ru"
# Публичный адрес вебхука (Caddy → api:8000, /api/* проксируется без ограничений)
PUBLIC_URL = "https://procityservice.ru"
BOTS = {"client": "client", "executor": "executor"}


def _secret() -> str:
    # Явный секрет из .env, иначе — jwt_secret (он уже уникален в проде)
    return (settings.max_webhook_secret or settings.jwt_secret or "").strip()


def _token(bot: str) -> str:
    tokens = {
        "client": settings.max_client_bot_token,
        "executor": settings.max_executor_bot_token,
    }
    t = (tokens.get(bot) or "").strip()
    if not t or t == "your_max_bot_token":
        return ""
    return t


def _post_max(path: str, token: str, body: dict) -> tuple[int, str]:
    """Один синхронный вызов MAX API (таймаут 10с, CA-пиннинг Минцифры)."""
    req = urllib.request.Request(
        f"{MAX_API}{path}",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            # MAX ждёт токен без префикса Bearer
            "Authorization": token,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10, context=_SSL_CTX) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")[:500]
    except Exception as e:
        return 0, str(e)[:500]


def subscribe_webhooks() -> None:
    """Пересоздаёт подписки вебхуков обоих ботов (при каждом старте api)."""
    secret = _secret()
    if not secret:
        _log.warning("MAX_HOOK секрет не задан — подписка не создана")
        return
    for bot in BOTS:
        token = _token(bot)
        if not token:
            _log.info("MAX_HOOK токен бота %s не настроен — пропуск", bot)
            continue
        status, text = _post_max(
            "/subscriptions",
            token,
            {
                "url": f"{PUBLIC_URL}/api/max/webhook/{bot}",
                "update_types": ["message_created"],
                "secret": secret,
            },
        )
        if status == 200:
            _log.info("MAX_HOOK подписка %s создана", bot)
        else:
            # Не фатально: api поднимется, но гео от бота не придёт
            _log.error("MAX_HOOK подписка %s НЕ создана: %s %s", bot, status, text)


class _Loc:
    """Толстый разбор вложения location: поля lat/lon в документации
    не зафиксированы точно (до 15 символов), поэтому ищем по ключам."""

    LAT_KEYS = ("lat", "latitude", "latitude_deg", "y")
    LON_KEYS = ("lon", "lng", "longitude", "longitude_deg", "long", "x")

    @classmethod
    def from_attachment(cls, att: dict) -> tuple[float, float] | None:
        if not isinstance(att, dict) or att.get("type") != "location":
            return None
        payload = att.get("payload") or att
        lat = lon = None
        for k in cls.LAT_KEYS:
            if k in payload:
                try:
                    lat = float(payload[k])
                    break
                except (TypeError, ValueError):
                    pass
        for k in cls.LON_KEYS:
            if k in payload:
                try:
                    lon = float(payload[k])
                    break
                except (TypeError, ValueError):
                    pass
        if lat is None or lon is None:
            return None
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            return None
        return lat, lon


def _decode(credentials) -> dict:
    if not credentials:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    try:
        return jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=["HS256"],
        )
    except JWTError:
        raise HTTPException(status_code=401, detail="Недействительный токен")


@router.post("/webhook/{bot}")
async def max_webhook(bot: str, request: Request, db: Session = Depends(get_db)):
    """Приём событий от MAX: location из чата сохраняем как позицию."""
    if bot not in BOTS:
        raise HTTPException(404, "Неизвестный бот")

    # Подлинность: MAX присылает секрет подписки заголовком
    got = request.headers.get("x-max-bot-api-secret") or request.headers.get("X-Max-Bot-Api-Secret") or ""
    if not secrets.compare_digest(got, _secret()):
        _log.warning("MAX_HOOK %s: неверный секрет", bot)
        raise HTTPException(403, "Bad secret")

    try:
        update = await request.json()
    except Exception:
        return {"ok": True}  # MAX требует 200 за 30 сек при любых раскладах

    if not isinstance(update, dict):
        return {"ok": True}

    # Любая ошибка разбора не должна отдавать 500: MAX ретраит такие
    # ответы и заваливает логи. Логируем и подтверждаем приём.
    try:
        _process_update(bot, update, db)
    except Exception:
        _log.exception("MAX_HOOK %s: ошибка разбора update", bot)
    return {"ok": True}


def _process_update(bot: str, update: dict, db: Session) -> None:
    etype = update.get("type") or update.get("update_type") or ""
    if etype not in ("message_created", "message_created_event"):
        # Прочие события (typing и т.п.) просто принимаем
        return {"ok": True}

    message = update.get("message") or {}
    sender = message.get("sender") or {}
    attachments = message.get("attachments") or []

    # Вложение location → координаты (формат payload логируем целиком при
    # первом реальном сообщении — вдруг поля другие)
    for att in attachments:
        coords = _Loc.from_attachment(att)
        if not coords:
            continue
        lat, lon = coords
        sender_id = str(sender.get("user_id") or sender.get("id") or "")
        _log.info(
            "MAX_HOOK %s: location от %s = %.6f,%.6f", bot, sender_id, lat, lon
        )
        if bot == "executor" and sender_id:
            executor = db.query(Executor).filter(Executor.max_id == sender_id).first()
            if executor:
                executor.last_lat = lat
                executor.last_lon = lon
                from datetime import datetime
                executor.last_seen_at = datetime.utcnow()
                db.commit()
                send_max_message(
                    sender_id,
                    "Геопозиция сохранена ✓ Откройте приложение «Про» — карта встанет на эту точку.",
                    bot="executor",
                )
                return {"ok": True}
            _log.info("MAX_HOOK executor с max_id=%s не найден", sender_id)
            return {"ok": True}

    # Первое сообщение без location — покажем, как поделиться (один раз;
    # пользователи, отправившие location, сюда не попадают).
    # body приходит и строкой, и объектом {"text": ...} — формат MAX
    # не зафиксирован, поэтому приводим к строке аккуратно (на живом
    # проде dict ронял вебхук с 500 — MAX начал ретраить).
    raw_body = message.get("body") or ""
    if isinstance(raw_body, dict):
        raw_body = raw_body.get("text") or raw_body.get("body") or ""
    body_text = str(raw_body).strip().lower()
    sender_id = str(sender.get("user_id") or sender.get("id") or "")
    if bot == "executor" and sender_id and body_text in ("/гео", "гео", "геолокация"):
        send_max_message(
            sender_id,
            "Нажмите кнопку ниже — MAX спросит разрешение на геолокацию.",
            bot="executor",
            keyboard=[[{"type": "request_geo_location", "text": "Поделиться геопозицией"}]],
        )
    return {"ok": True}


class _GeoReqIn(BaseModel):
    pass


@router.post("/geo-request")
def geo_request(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    """Миниапп просит бота отправить исполнителю кнопку геолокации."""
    payload = _decode(credentials)
    if payload.get("role") != "executor":
        raise HTTPException(403, "Только для исполнителя")
    executor_id = payload.get("sub")
    executor = db.query(Executor).filter(Executor.id == executor_id).first()
    if not executor or not executor.max_id:
        raise HTTPException(404, "Профиль не найден")

    # Одна живая сессия: токен с прошлого устройства ничего не отправляет
    ensure_executor_session(payload, executor)

    if not _token("executor"):
        raise HTTPException(503, "Бот не настроен")

    result = send_max_message(
        str(executor.max_id),
        "Поделитесь геопозицией — карта в приложении встанет на ваше место. "
        "Нажмите кнопку ниже и разрешите доступ.",
        bot="executor",
        keyboard=[[{"type": "request_geo_location", "text": "Поделиться геопозицией"}]],
    )
    if not result.get("sent"):
        _log.error("MAX_HOOK geo-request не ушёл: %s", result)
        raise HTTPException(502, "Не удалось отправить сообщение ботом")
    return {"ok": True}
