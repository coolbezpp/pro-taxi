from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwt, JWTError
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Client, Executor, Order, OrderMessage, User
from ..security import bearer_scheme

router = APIRouter(prefix="/api", tags=["tracking"])


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
        if order.driver_id and int(order.driver_id) == executor_id:
            return "executor"
        raise HTTPException(status_code=403, detail="Это не ваш заказ")

    client = _client_of_token(db, payload)
    if client and order.passenger_id == client.id:
        return "client"

    raise HTTPException(status_code=403, detail="Это не ваш заказ")


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

    executor.last_lat = float(data.lat)
    executor.last_lon = float(data.lon)
    executor.last_seen_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "lat": executor.last_lat, "lon": executor.last_lon}


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
    _require_participant(db, order, payload)

    driver = None
    if order.driver_id:
        executor = db.query(Executor).filter(Executor.id == order.driver_id).first()
        if executor:
            driver = {
                "id": executor.id,
                "name": executor.name or "Исполнитель",
                "rating_likes": int(executor.rating_likes or 0),
                "rating_dislikes": int(executor.rating_dislikes or 0),
                "lat": executor.last_lat,
                "lon": executor.last_lon,
                "updated_at": executor.last_seen_at.isoformat() if executor.last_seen_at else None,
            }

    client_name = None
    if order.passenger_id:
        client = db.query(Client).filter(Client.id == order.passenger_id).first()
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
        "total_price": order.total_price,
        "comment": (order.meta or {}).get("comment") if order.meta else None,
        "client_name": client_name,
        "driver": driver,
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

    author_id = order.passenger_id
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
