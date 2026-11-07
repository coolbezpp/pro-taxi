"""Смена статуса заказа и расчёты по нему — общий путь для всех эндпоинтов.

Коммит делает вызывающий эндпоинт.
"""

from datetime import datetime, timezone

from fastapi import HTTPException

from .. import models, order_states, pricing, worktime

EVENT_NAMES = {
    "take": "accepted",
    "assign": "assigned",
    "accept": "accepted",
    "decline": "declined",
    "arrive": "arrived",
    "start": "started",
    "complete": "completed",
    "executor_cancel": "executor_cancelled",
    # Любая отмена заказа — событие cancelled (по нему считает антифрод),
    # кто отменил — в payload.actor
    "client_cancel": "cancelled",
    "staff_cancel": "cancelled",
    "timeout": "cancelled",
    "activate_chain": "chain_activated",
    "reserve_chain": "chain_reserved",
    "release_chain": "chain_released",
}

# События, после которых заказ снова ждёт исполнителя в ленте
REQUEUE_EVENTS = ("declined", "executor_cancelled")


def apply(db, order, action, actor, actor_id=None, payload=None):
    """Переводит заказ по действию и пишет событие в журнал заказа."""
    try:
        order.status = order_states.next_status(order.status, action)
    except ValueError as e:
        raise HTTPException(409, str(e))
    if action in ("decline", "executor_cancel", "release_chain"):
        order.executor_id = None
    if action == "release_chain":
        order.chain_reserved_order_id = None
    # actor_id пишем всегда (даже None): форма payload события единая
    data = {"actor": actor, "actor_id": actor_id}
    if payload:
        data.update(payload)
    db.add(models.OrderEvent(order_id=order.id, event=EVENT_NAMES[action], payload=data))
    db.flush()
    return order


def chained_order(db, order):
    """Заказ, забронированный следующим за этим в цепочке."""
    return db.query(models.Order).filter(
        models.Order.chain_reserved_order_id == order.id,
        models.Order.status == order_states.CHAIN_RESERVED,
    ).first()


def activate_chain(db, order, actor="system"):
    """После завершения заказа следующий в цепочке назначается исполнителю."""
    nxt = chained_order(db, order)
    if nxt:
        nxt.executor_id = order.executor_id
        apply(db, nxt, "activate_chain", actor, order.executor_id)
    return nxt


def release_chain(db, order, actor="system"):
    """Заказ не будет выполнен — бронь следующего в цепочке возвращаем в ленту."""
    nxt = chained_order(db, order)
    if nxt:
        apply(db, nxt, "release_chain", actor, payload={"reason": f"заказ №{order.id} не выполнен"})
    return nxt


def _naive_utc(dt):
    if dt is not None and dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def last_event(db, order, events):
    return (
        db.query(models.OrderEvent)
        .filter(
            models.OrderEvent.order_id == order.id,
            models.OrderEvent.event.in_(list(events)),
        )
        .order_by(models.OrderEvent.id.desc())
        .first()
    )


def staff_assigned_at(db, order):
    """Когда оператор назначил заказ. None — назначен не оператором
    (цепочка, старые данные): у такого заказа таймера принятия нет."""
    ev = last_event(db, order, ("assigned", "chain_activated"))
    if not ev or ev.event != "assigned" or (ev.payload or {}).get("actor") != "staff":
        return None
    return ev.created_at


def accept_seconds_left(db, order, now=None):
    """Сколько секунд осталось принять назначенный оператором заказ."""
    if order.status != order_states.ASSIGNED:
        return None
    at = staff_assigned_at(db, order)
    if at is None:
        return None
    passed = ((now or datetime.utcnow()) - at).total_seconds()
    return max(0, int(order_states.ASSIGNED_ACCEPT_SECONDS - passed))


def waiting_since(db, order):
    """С какого момента заказ ждёт исполнителя: создание, время подачи
    предзаказа или последний возврат в ленту."""
    moments = [order.created_at, _naive_utc(order.scheduled_at)]
    ev = last_event(db, order, REQUEUE_EVENTS)
    if ev:
        moments.append(ev.created_at)
    moments = [m for m in moments if m is not None]
    return max(moments) if moments else datetime.utcnow()


def apply_waiting(db, order, now=None):
    """Платное ожидание от «Я на месте» до «Начать поездку». Возвращает минуты."""
    ev = last_event(db, order, ("arrived",))
    if not ev or not ev.created_at:
        return 0
    minutes = int(((now or datetime.utcnow()) - ev.created_at).total_seconds() // 60)
    waiting = pricing.calc_waiting(minutes)
    if waiting > 0:
        order.waiting_price = waiting
        order.total_price = pricing.rub(
            (order.base_price or 0) + (order.options_price or 0)
            + waiting + (order.manual_increase or 0)
        )
        order.commission_amount = pricing.commission(order.total_price, order.commission_percent)
    return minutes


def charge_commission(db, order):
    """Оплата наличными: деньги у исполнителя, с баланса списываем комиссию.

    Повторное завершение не списывает второй раз. Старые заказы, по которым
    раньше начислялся заработок (earning), тоже не трогаем.
    """
    if not order.executor_id:
        return 0
    done = db.query(models.ExecutorBalanceOp).filter(
        models.ExecutorBalanceOp.order_id == order.id,
        models.ExecutorBalanceOp.type.in_(["commission", "earning"]),
    ).first()
    if done:
        return 0
    executor = db.query(models.Executor).get(order.executor_id)
    if not executor:
        return 0
    fee = pricing.rub(order.commission_amount)
    executor.balance = (executor.balance or 0) - fee
    db.add(models.ExecutorBalanceOp(
        executor_id=executor.id,
        type="commission",
        amount=-fee,
        order_id=order.id,
        comment=f"Комиссия за заказ №{order.id}",
    ))
    worktime.touch_session(db, executor.id)
    return fee
