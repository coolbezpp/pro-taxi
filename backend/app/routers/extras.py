from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwt, JWTError
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..config import settings
from ..db import get_db
from ..models import Order, OrderExtra, OrderEvent, Notification, Client, User, Executor
from ..security import bearer_scheme, get_current_executor
from .. import order_states, pricing
from ..services.max_notify import send_max_message

router = APIRouter(tags=["extras"])


def _participant(db: Session, order: Order, credentials):
    """Доступ к допуслугам заказа: его исполнитель или его клиент."""
    if not credentials:
        raise HTTPException(401, "Требуется авторизация")
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(401, "Недействительный токен")

    role = payload.get("role")
    if role == "executor":
        try:
            executor_id = int(payload.get("sub"))
        except (TypeError, ValueError):
            raise HTTPException(401, "Некорректный токен")
        if not order.executor_id or executor_id != order.executor_id:
            raise HTTPException(403, "Это не ваш заказ")
        return

    if role == "client":
        try:
            user = db.query(User).get(int(payload.get("sub")))
        except (TypeError, ValueError):
            raise HTTPException(401, "Некорректный токен")
        client = db.query(Client).get(order.client_id) if order.client_id else None
        if not user or not client or client.max_id != user.max_user_id:
            raise HTTPException(403, "Это не ваш заказ")
        return

    raise HTTPException(403, "Недостаточно прав")

class ExtraIn(BaseModel):
    order_id: int
    executor_id: int
    title: str
    description: str = ""
    price: float

class DecisionIn(BaseModel):
    decision: str

@router.post("/orders/{order_id}/extras")
def create_extra(
    order_id: int,
    data: ExtraIn,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    order = db.query(Order).get(order_id)
    if not order:
        raise HTTPException(404, "Заказ не найден")

    # Предложить допуслугу может только исполнитель этого заказа
    executor = get_current_executor(credentials, db)
    if order.executor_id != executor.id or int(data.executor_id or 0) != executor.id:
        raise HTTPException(403, "Это не ваш заказ")

    if order.status not in list(order_states.ACTIVE_STATUSES):
        raise HTTPException(409, "Допуслугу можно добавить только в активном заказе")

    if data.price < 0:
        raise HTTPException(400, "Цена не может быть отрицательной")

    price = pricing.rub(data.price)
    extra = OrderExtra(
        order_id=order_id,
        executor_id=executor.id,
        title=data.title,
        description=data.description,
        price=price,
        status="pending"
    )
    db.add(extra)

    db.add(OrderEvent(
        order_id=order_id,
        event=f"extra_offered:{data.title}:{price}"
    ))

    if order.client_id:
        client = db.query(Client).get(order.client_id)
        if client:
            db.add(Notification(
                user_max_id=client.max_id,
                title="Новая допуслуга",
                body=f"Исполнитель предложил: {data.title} — {price} ₽",
                order_id=order_id,
                category="order"
            ))

    db.commit()
    db.refresh(extra)
    return extra

@router.get("/orders/{order_id}/extras")
def list_extras(
    order_id: int,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    order = db.query(Order).get(order_id)
    if not order:
        raise HTTPException(404, "Заказ не найден")
    _participant(db, order, credentials)
    return db.query(OrderExtra).filter(OrderExtra.order_id == order_id).all()

@router.put("/extras/{extra_id}/decision")
def decide_extra(
    extra_id: int,
    data: DecisionIn,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    extra = db.query(OrderExtra).get(extra_id)
    if not extra:
        raise HTTPException(404, "Допуслуга не найдена")

    order = db.query(Order).get(extra.order_id)
    if not order:
        raise HTTPException(404, "Заказ не найден")
    _participant(db, order, credentials)

    if data.decision not in ["approved", "rejected"]:
        raise HTTPException(400, "Решение должно быть approved или rejected")

    if extra.status != "pending":
        raise HTTPException(409, "По этой допуслуге уже есть решение")

    extra.status = data.decision
    db.add(OrderEvent(
        order_id=extra.order_id,
        event=f"extra_{data.decision}:{extra.title}:{extra.price}"
    ))

    if data.decision == "approved":
        order = db.query(Order).get(extra.order_id)
        if order:
            price = pricing.rub(extra.price)
            extra.price = price
            order.options_price = pricing.rub((order.options_price or 0) + price)
            order.total_price = pricing.rub((order.total_price or 0) + price)
            order.commission_amount = pricing.commission(
                order.total_price, order.commission_percent or 15
            )

            if order.client_id:
                client = db.query(Client).get(order.client_id)
                if client:
                    db.add(Notification(
                        user_max_id=client.max_id,
                        title="Допуслуга подтверждена",
                        body=f"{extra.title} — {extra.price} ₽ добавлена к заказу №{order.id}",
                        order_id=order.id,
                        category="order"
                    ))

                    send_max_message(
                        client.max_id,
                        f"Допуслуга подтверждена: {extra.title} — {extra.price} ₽. Итог заказа №{order.id}: {order.total_price} ₽.",
                        bot="client"
                    )

    db.commit()
    return extra
