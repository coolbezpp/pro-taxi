import hashlib
import secrets as pysecrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwt, JWTError
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Client, Executor, Order, OrderEvent, OrderMessage, TrackingCode, User, ExecutorVehicle
from ..security import bearer_scheme, create_token, ensure_executor_session

router = APIRouter(prefix="/api", tags=["tracking"])

# Страница GPS-трекинга: водитель берёт одноразовый код в миниаппе
# (GPS в вебвью MAX заблокирован) и вводит его в системном браузере,
# где navigator.geolocation работает штатно.
TRACK_URL = "https://procityservice.ru/executor/track.html"
CODE_TTL_MINUTES = 10
# Без 0/O/1/I/L — чтобы код читалось с экрана телефона без путаницы
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


class PositionIn(BaseModel):
    lat: float
    lon: float


class MessageIn(BaseModel):
    text: str
    executor_id: int | None = None


def _decode(credentials):
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


def _client_of_token(db: Session, payload: dict):
    """Клиент по токену (users.max_user_id → clients.max_id)."""
    try:
        user = db.query(User).get(int(payload.get("sub")))
    except (TypeError, ValueError):
        return None
    if not user:
        return None
    return db.query(Client).filter(Client.max_id == user.max_user_id).first()


def _require_participant(db: Session, order, payload: dict) -> str:
    """Проверяем, что пользователь — участник заказа. Возвращает роль."""
    role = payload.get("role")

    if role == "executor":
        try:
            executor_id = int(payload.get("sub"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=401, detail="Некорректный токен")
        if order.executor_id and int(order.executor_id) == executor_id:
            executor = db.query(Executor).get(executor_id)
            if executor:
                ensure_executor_session(payload, executor)
            return "executor"
        raise HTTPException(status_code=403, detail="Это не ваш заказ")

    client = _client_of_token(db, payload)
    if client and order.client_id == client.id:
        return "client"

    raise HTTPException(status_code=403, detail="Это не ваш заказ")


def _as_naive_utc(dt):
    """Хранилище — naive UTC; приводим tz-aware значения (scheduled_at из ISO)."""
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _assignment_time(db: Session, order):
    """Момент назначения исполнителя: событие assigned/accepted, иначе создание."""
    row = (
        db.query(OrderEvent)
        .filter(
            OrderEvent.order_id == order.id,
            OrderEvent.event.in_(["assigned", "accepted"]),
        )
        .order_by(OrderEvent.id.desc())
        .first()
    )
    moment = _as_naive_utc(row.created_at) if row else None
    return moment or _as_naive_utc(order.created_at)


def _location_visible_to_client(db: Session, order) -> bool:
    """Приватность позиции исполнителя для роли client.

    - «master»: локация не показывается никогда;
    - «cargo» и межгород (tariff intercity): только за 10 минут до начала
      выполнения; для заказа без расписания отсчёт идёт от момента назначения
      (исполнитель принимает заказ — раньше клиент его не видит);
    - обычное такси: без изменений (всегда видно);
    - завершённый/отменённый заказ в отложенных сервисах больше не показывает
      актуальную позицию (иначе клиент «следит» за исполнителем после работы).
    """
    service = (order.service or "taxi").lower()
    if service == "master":
        return False

    tariff = (order.tariff_code or "").lower()
    delayed = service == "cargo" or "intercity" in tariff or "межгород" in tariff
    if not delayed:
        return True
    if order.status in ("completed", "cancelled"):
        return False

    now = datetime.utcnow()
    assigned = _assignment_time(db, order)
    scheduled = _as_naive_utc(order.scheduled_at)

    # Заказ с расписанием (вперёд от момента назначения) — окно от scheduled_at.
    if scheduled is not None and (assigned is None or scheduled > assigned):
        if now >= scheduled - timedelta(minutes=10):
            return True
        return False

    # Немедленный заказ: первые 10 минут после назначения позиция скрыта.
    if assigned is None:
        return False
    return now >= assigned + timedelta(minutes=10)


@router.post("/executors/{executor_id}/position")
def update_position(
    executor_id: int,
    data: PositionIn,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    """Исполнитель шлёт свою геопозицию — клиент видит движение."""
    payload = _decode(credentials)
    if payload.get("role") != "executor":
        raise HTTPException(status_code=403, detail="Токен не для исполнителя")
    try:
        if int(payload.get("sub")) != int(executor_id):
            raise HTTPException(status_code=403, detail="Это не ваш профиль")
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Некорректный токен")

    executor = db.query(Executor).filter(Executor.id == executor_id).first()
    if not executor:
        raise HTTPException(404, "Исполнитель не найден")

    # Одна живая сессия: токен с прошлого устройства позицию не пишет
    ensure_executor_session(payload, executor)

    executor.last_lat = float(data.lat)
    executor.last_lon = float(data.lon)
    executor.last_seen_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "lat": executor.last_lat, "lon": executor.last_lon}


def _hash_code(code: str) -> str:
    """Хэш кода: сам код в БД не хранится, только отпечаток."""
    return hashlib.sha256(f"{settings.jwt_secret}:{code}".encode()).hexdigest()


class _TrackCodeOut(BaseModel):
    code: str
    expires_in: int
    url: str


@router.post("/executor/tracking-code", response_model=_TrackCodeOut)
def issue_tracking_code(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    """Миниапп выдаёт одноразовый код для страницы трекинга в браузере.

    Живёт 10 минут, применяется один раз; предыдущие неиспользованные
    коды исполнителя гасятся при выдаче нового.
    """
    payload = _decode(credentials)
    if payload.get("role") != "executor":
        raise HTTPException(status_code=403, detail="Только для исполнителя")
    try:
        executor = db.query(Executor).filter(Executor.id == int(payload.get("sub"))).first()
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Некорректный токен")
    if not executor:
        raise HTTPException(status_code=404, detail="Профиль не найден")

    # Одна живая сессия: токен со старого устройства код не выдаёт
    ensure_executor_session(payload, executor)

    now = datetime.utcnow()
    db.query(TrackingCode).filter(
        TrackingCode.executor_id == executor.id,
        TrackingCode.used_at.is_(None),
    ).update({"used_at": now})

    raw = "".join(pysecrets.choice(_CODE_ALPHABET) for _ in range(8))
    db.add(TrackingCode(
        executor_id=executor.id,
        code_hash=_hash_code(raw),
        expires_at=now + timedelta(minutes=CODE_TTL_MINUTES),
    ))
    db.commit()

    return {
        "code": f"{raw[:4]}-{raw[4:]}",
        "expires_in": CODE_TTL_MINUTES * 60,
        "url": TRACK_URL,
    }


class _TrackAuthIn(BaseModel):
    code: str


@router.post("/track/session")
def track_session(data: _TrackAuthIn, db: Session = Depends(get_db)):
    """Обмен одноразового кода на токен для страницы трекинга.

    Токен живёт 7 дней и привязан к текущей сессии исполнителя: при
    входе на другом устройстве страница трекинга попросит новый код.
    """
    raw = (data.code or "").replace("-", "").replace(" ", "").strip().upper()
    if not raw or len(raw) > 20:
        raise HTTPException(status_code=400, detail="Некорректный код")

    now = datetime.utcnow()
    row = db.query(TrackingCode).filter(
        TrackingCode.code_hash == _hash_code(raw),
        TrackingCode.used_at.is_(None),
    ).first()
    if not row or row.expires_at < now:
        raise HTTPException(status_code=401, detail="Код недействителен или истёк")

    executor = db.query(Executor).filter(Executor.id == row.executor_id).first()
    if not executor:
        raise HTTPException(status_code=404, detail="Профиль не найден")

    row.used_at = now
    db.commit()

    return {
        "token": create_token(executor.id, "executor", sid=executor.session_id, days=7),
        "executor": {"id": executor.id, "name": executor.name or "Исполнитель"},
    }


@router.get("/orders/{order_id}/track")
def track_order(
    order_id: int,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    """Данные для окна слежения: статус, исполнитель и его позиция."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Заказ не найден")

    payload = _decode(credentials)
    role = _require_participant(db, order, payload)

    executor_info = None
    if order.executor_id:
        executor = db.query(Executor).filter(Executor.id == order.executor_id).first()
        if executor:
            executor_info = {
                "id": executor.id,
                "name": executor.name or "Исполнитель",
                "rating_likes": int(executor.rating_likes or 0),
                "rating_dislikes": int(executor.rating_dislikes or 0),
                "rating_percent": executor.rating_percent if executor.rating_percent is not None else 100,
                "lat": executor.last_lat,
                "lon": executor.last_lon,
                "updated_at": executor.last_seen_at.isoformat() if executor.last_seen_at else None,
            }
            # Транспорт: клиент видит авто исполнителя при заказе транспортных услуг
            vehicle = db.query(ExecutorVehicle).filter(
                ExecutorVehicle.executor_id == executor.id
            ).first()
            if vehicle and (vehicle.brand or vehicle.plate):
                executor_info["vehicle"] = {
                    "brand": vehicle.brand,
                    "model": vehicle.model,
                    "color": vehicle.color,
                    "plate": vehicle.plate,
                }
            # Приватность: клиент видит позицию только по правилам сервиса
            # (мастер — никогда; cargo/межгород — за 10 минут до начала).
            if role == "client" and not _location_visible_to_client(db, order):
                executor_info["lat"] = None
                executor_info["lon"] = None
                executor_info["updated_at"] = None

    client_name = None
    if order.client_id:
        client = db.query(Client).filter(Client.id == order.client_id).first()
        client_name = client.name if client else None

    return {
        "order_id": order.id,
        "status": order.status,
        "from_address": order.from_address,
        "to_address": order.to_address,
        "from_lat": order.from_lat,
        "from_lon": order.from_lon,
        "to_lat": order.to_lat,
        "to_lon": order.to_lon,
        "total_price": round(order.total_price or 0),
        "comment": (order.meta or {}).get("comment") if order.meta else None,
        "client_name": client_name,
        "executor": executor_info,
    }


@router.get("/orders/{order_id}/messages")
def list_messages(
    order_id: int,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Заказ не найден")

    payload = _decode(credentials)
    _require_participant(db, order, payload)

    rows = (
        db.query(OrderMessage)
        .filter(OrderMessage.order_id == order_id)
        .order_by(OrderMessage.id.asc())
        .limit(200)
        .all()
    )
    return [
        {
            "id": row.id,
            "author_role": row.author_role,
            "author_id": row.author_id,
            "text": row.text,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]


@router.post("/orders/{order_id}/messages")
def send_message(
    order_id: int,
    data: MessageIn,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    """Сообщение в чат: автор определяется токеном (клиент или исполнитель)."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Заказ не найден")

    payload = _decode(credentials)
    author_role = _require_participant(db, order, payload)

    text = (data.text or "").strip()
    if not text:
        raise HTTPException(400, "Пустое сообщение")
    text = text[:1000]

    author_id = order.client_id
    if author_role == "executor":
        author_id = int(payload.get("sub"))

    row = OrderMessage(
        order_id=order_id,
        author_role=author_role,
        author_id=author_id,
        text=text,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "author_role": row.author_role,
        "author_id": row.author_id,
        "text": row.text,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
