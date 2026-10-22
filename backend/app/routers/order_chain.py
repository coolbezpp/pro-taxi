from ..models import OrderEvent
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import Order, Executor, ExecutorRole, Client, Rating
from ..services.max_notify import send_max_message
from ..services.selforder import self_order_blocked

router = APIRouter(tags=["order-chain"])

ACTIVE = ["assigned", "accepted", "in_progress"]


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
def chain_candidates(order_id: int, executor_id: int, db: Session = Depends(get_db)):
    current = db.query(Order).filter(Order.id == order_id).first()
    if not current:
        raise HTTPException(404, "Заказ не найден")

    executor = db.query(Executor).filter(Executor.id == executor_id).first()
    if not executor:
        raise HTTPException(404, "Исполнитель не найден")

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
            "total_price": o.total_price,
            "tariff_code": getattr(o, "tariff_code", ""),
            "reverse": intercity and reverse_match(current, o)
        })

    return {
        "available": bool(result),
        "mode": "reverse_intercity" if intercity else "before_completion",
        "orders": result
    }

@router.post("/orders/{order_id}/chain/{next_order_id}/reserve")
def reserve_chain(order_id: int, next_order_id: int, executor_id: int, db: Session = Depends(get_db)):
    current = db.query(Order).filter(Order.id == order_id).first()
    next_order = db.query(Order).filter(Order.id == next_order_id).first()

    if not current or not next_order:
        raise HTTPException(404, "Заказ не найден")

    if next_order.status != "created":
        raise HTTPException(409, "Заказ уже занят")

    if is_intercity(current) and not reverse_match(current, next_order):
        raise HTTPException(400, "Для межгорода доступен только встречный заказ в обратном направлении")

    # Анти-самозаказы: свой заказ в цепочку тоже брать нельзя
    executor = db.query(Executor).get(executor_id)
    so = self_order_blocked(db, next_order, executor)
    if so:
        raise HTTPException(403, so)

    next_order.status = "chain_reserved"
    next_order.chain_reserved_order_id = current.id
    db.commit()

    return {"reserved": True, "next_order_id": next_order.id}


@router.post("/orders/{order_id}/accept")
def accept_order(order_id: int, executor_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Заказ не найден")
    if order.executor_id != executor_id:
        raise HTTPException(403, "Заказ назначен другому исполнителю")
    if order.status != "assigned":
        raise HTTPException(409, "Заказ нельзя принять в текущем статусе")

    order.status = "accepted"
    db.add(OrderEvent(order_id=order.id, event="accepted", payload={"executor_id": executor_id}))
    db.commit()
    db.refresh(order)
    notify_client(db, order, f"Ваш заказ №{order.id} принят. Исполнитель направляется к вам.")
    return order


@router.post("/orders/{order_id}/start")
def start_order(order_id: int, executor_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Заказ не найден")
    if order.executor_id != executor_id:
        raise HTTPException(403, "Заказ назначен другому исполнителю")
    if order.status != "accepted":
        raise HTTPException(409, "Сначала примите заказ")

    order.status = "in_progress"
    db.add(OrderEvent(order_id=order.id, event="started", payload={"executor_id": executor_id}))
    db.commit()
    db.refresh(order)
    notify_client(db, order, f"Началась поездка по заказу №{order.id}.")
    return order


@router.get("/orders/executor/{executor_id}")
@router.get("/orders/driver/{executor_id}")  # legacy-URL старого миниаппа
def executor_orders(executor_id: int, db: Session = Depends(get_db)):
    query = db.query(Order).filter(Order.executor_id == executor_id)
    orders = query.order_by(Order.id.desc()).limit(100).all()

    return [{
        "id": o.id,
        "status": o.status,
        "service": o.service,
        "tariff_code": o.tariff_code,
        "from_address": o.from_address,
        "to_address": o.to_address,
        "total_price": o.total_price,
        "client_id": o.client_id,
        "executor_id": o.executor_id,
        "rated": db.query(Rating).filter_by(order_id=o.id, author_id=executor_id).first() is not None,
    } for o in orders]
