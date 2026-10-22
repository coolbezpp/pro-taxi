from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import Order, OrderExtra, OrderEvent, Notification, Client
from ..services.max_notify import send_max_message

router = APIRouter(tags=["extras"])

class ExtraIn(BaseModel):
    order_id: int
    executor_id: int
    title: str
    description: str = ""
    price: float

class DecisionIn(BaseModel):
    decision: str

@router.post("/orders/{order_id}/extras")
def create_extra(order_id: int, data: ExtraIn, db: Session = Depends(get_db)):
    order = db.query(Order).get(order_id)
    if not order:
        raise HTTPException(404, "Заказ не найден")

    if order.status not in ["assigned", "accepted", "in_progress"]:
        raise HTTPException(409, "Допуслугу можно добавить только в активном заказе")

    if data.price < 0:
        raise HTTPException(400, "Цена не может быть отрицательной")

    extra = OrderExtra(
        order_id=order_id,
        executor_id=data.executor_id,
        title=data.title,
        description=data.description,
        price=data.price,
        status="pending"
    )
    db.add(extra)

    db.add(OrderEvent(
        order_id=order_id,
        event=f"extra_offered:{data.title}:{data.price}"
    ))

    if order.client_id:
        client = db.query(Client).get(order.client_id)
        if client:
            db.add(Notification(
                user_max_id=client.max_id,
                title="Новая допуслуга",
                body=f"Исполнитель предложил: {data.title} — {data.price} ₽",
                order_id=order_id,
                category="order"
            ))

    db.commit()
    db.refresh(extra)
    return extra

@router.get("/orders/{order_id}/extras")
def list_extras(order_id: int, db: Session = Depends(get_db)):
    return db.query(OrderExtra).filter(OrderExtra.order_id == order_id).all()

@router.put("/extras/{extra_id}/decision")
def decide_extra(extra_id: int, data: DecisionIn, db: Session = Depends(get_db)):
    extra = db.query(OrderExtra).get(extra_id)
    if not extra:
        raise HTTPException(404, "Допуслуга не найдена")

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
            order.options_price = (order.options_price or 0) + extra.price
            order.total_price = (order.total_price or 0) + extra.price
            order.commission_amount = round(
                (order.total_price or 0) * (order.commission_percent or 15) / 100,
                2,
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
