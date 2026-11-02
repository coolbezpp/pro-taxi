from ..models import OrderEvent
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import Order, Executor, ExecutorRole, Client, Rating
from ..security import bearer_scheme, get_current_executor
from ..services.max_notify import send_max_message
from ..services.selforder import self_order_blocked
from ..services import order_flow
from .. import rating as rating_service, order_states, worktime, pricing

router = APIRouter(tags=["order-chain"])

ACTIVE = list(order_states.ACTIVE_STATUSES)


def _owning_executor(order_id, executor_id: int, credentials, db):
    """Проверка: токен исполнителя, профиль совпадает и заказ назначен на него."""
    executor = get_current_executor(credentials, db)
    if executor.id != executor_id:
        raise HTTPException(403, "Действие доступно только владельцу заказа")
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Заказ не найден")
    if order.executor_id != executor.id:
        raise HTTPException(403, "Заказ назначен другому исполнителю")
    return order, executor


def notify_client(db, order, text):
    """Пуш клиенту по поездке (не ломает обработку, если бот не настроен)."""
    if order.client_id:
        client = db.query(Client).filter(Client.id == order.client_id).first()
        if client:
            send_max_message(client.max_id, text, bot="client")

def get_active_order(db: Session, executor_id: int):
    q = db.query(Order).filter(Order.status.in_(ACTIVE))
    for field in ["executor_id", "courier_id", "worker_id"]:
        if hasattr(Order, field):
            return q.filter(getattr(Order, field) == executor_id).first()
    return None

def is_intercity(order: Order):
    code = (getattr(order, "tariff_code", "") or "").lower()
    return "intercity" in code or "межгород" in code

def reverse_match(current: Order, candidate: Order):
    return (
        current.from_address == candidate.to_address
        and current.to_address == candidate.from_address
    )

@router.get("/orders/{order_id}/chain")
def chain_candidates(
    order_id: int,
    executor_id: int,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    current, _ = _owning_executor(order_id, executor_id, credentials, db)

    intercity = is_intercity(current)

    # Для обычного заказа цепочка доступна за 4 минуты до завершения
    if not intercity:
        finish = current.planned_completion_at
        if not finish:
            return {"available": False, "reason": "Время завершения пока не определено"}
        if finish - datetime.utcnow() > timedelta(minutes=4):
            return {"available": False, "reason": "Цепочка откроется за 4 минуты до завершения"}

    # Для межгорода ищем встречный заказ в обратном направлении
    candidates = db.query(Order).filter(Order.status == "created").all()

    if intercity:
        candidates = [o for o in candidates if reverse_match(current, o)]
    else:
        candidates = [o for o in candidates if o.id != current.id]

    result = []
    for o in candidates[:10]:
        result.append({
            "id": o.id,
            "from_address": o.from_address,
            "to_address": o.to_address,
            "total_price": round(o.total_price or 0),
            "tariff_code": getattr(o, "tariff_code", ""),
            "reverse": intercity and reverse_match(current, o)
        })

    return {
        "available": bool(result),
        "mode": "reverse_intercity" if intercity else "before_completion",
        "orders": result
    }

@router.post("/orders/{order_id}/chain/{next_order_id}/reserve")
def reserve_chain(
    order_id: int,
    next_order_id: int,
    executor_id: int,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    current, executor = _owning_executor(order_id, executor_id, credentials, db)
    next_order = db.query(Order).filter(Order.id == next_order_id).first()

    if not next_order:
        raise HTTPException(404, "Заказ не найден")

    if next_order.status != "created":
        raise HTTPException(409, "Заказ уже занят")

    if is_intercity(current) and not reverse_match(current, next_order):
        raise HTTPException(400, "Для межгорода доступен только встречный заказ в обратном направлении")

    # Анти-самозаказы: свой заказ в цепочку тоже брать нельзя
    so = self_order_blocked(db, next_order, executor)
    if so:
        raise HTTPException(403, so)

    order_flow.apply(db, next_order, "reserve_chain", "executor", executor.id)
    next_order.chain_reserved_order_id = current.id
    db.commit()

    return {"reserved": True, "next_order_id": next_order.id}


@router.post("/orders/{order_id}/accept")
def accept_order(
    order_id: int,
    executor_id: int,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    """Исполнитель подтверждает, что выезжает к клиенту (назначенный заказ)."""
    order, executor = _owning_executor(order_id, executor_id, credentials, db)

    # Временное отстранение: низкий рейтинг или решение администратора
    susp = rating_service.active_suspension(db, executor.id)
    if susp:
        raise HTTPException(403, rating_service.suspension_notice(susp))

    order_flow.apply(db, order, "accept", "executor", executor.id)
    worktime.touch_session(db, executor.id)
    db.commit()
    db.refresh(order)
    notify_client(db, order, f"Ваш заказ №{order.id} принят. Исполнитель направляется к вам.")
    return order


@router.post("/orders/{order_id}/start")
def start_order(
    order_id: int,
    executor_id: int,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    """Начало поездки. Считает бесплатное ожидание: 2 минуты бесплатно
    от отметки «Я на месте», дальше поминутно."""
    order, executor = _owning_executor(order_id, executor_id, credentials, db)

    minutes = order_flow.apply_waiting(db, order)
    order_flow.apply(db, order, "start", "executor", executor.id)
    worktime.touch_session(db, executor.id)
    db.commit()
    db.refresh(order)
    notify_client(db, order, f"Началась поездка по заказу №{order.id}.")
    if minutes > 0:
        notify_client(
            db, order,
            f"Ожидание: {minutes} мин, к оплате {order.waiting_price} ₽ "
            f"(первые {pricing.FREE_WAITING_MINUTES} мин бесплатно).",
        )
    return order


@router.get("/orders/executor/{executor_id}")
@router.get("/orders/driver/{executor_id}")  # legacy-URL старого миниаппа
def executor_orders(
    executor_id: int,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    executor = get_current_executor(credentials, db)
    if executor.id != executor_id:
        raise HTTPException(403, "Заказы доступны только владельцу профиля")
    query = db.query(Order).filter(Order.executor_id == executor_id)
    orders = query.order_by(Order.id.desc()).limit(100).all()

    # Рейтинг клиентов для карточек заказов (одним запросом)
    client_ids = {o.client_id for o in orders if o.client_id}
    client_percents = {
        c.id: (c.rating_percent if c.rating_percent is not None else 100)
        for c in db.query(Client).filter(Client.id.in_(client_ids)).all()
    } if client_ids else {}

    # Оценки исполнителя и моменты завершения — для часового окна оценки
    order_ids = [o.id for o in orders]
    my_ratings = {
        r.order_id: r.value
        for r in db.query(Rating).filter(
            Rating.order_id.in_(order_ids),
            Rating.author_id == executor_id,
        ).all()
    } if order_ids else {}
    completed_map = {
        e.order_id: e.created_at
        for e in db.query(OrderEvent).filter(
            OrderEvent.order_id.in_(order_ids),
            OrderEvent.event == "completed",
        ).order_by(OrderEvent.id.asc()).all()
    } if order_ids else {}

    return [{
        "id": o.id,
        "status": o.status,
        "service": o.service,
        "tariff_code": o.tariff_code,
        "from_address": o.from_address,
        "to_address": o.to_address,
        "total_price": round(o.total_price or 0),
        "client_id": o.client_id,
        "executor_id": o.executor_id,
        "client_rating": client_percents.get(o.client_id),
        "rated": o.id in my_ratings,
        "rated_value": my_ratings.get(o.id),
        # Сколько секунд осталось принять заказ, назначенный оператором
        # (None — таймера нет: взяли из ленты или цепочка)
        "accept_seconds_left": order_flow.accept_seconds_left(db, o),
        "completed_at": (
            completed_map[o.id].isoformat() if completed_map.get(o.id) else None
        ),
    } for o in orders]
