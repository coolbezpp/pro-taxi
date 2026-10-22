from sqlalchemy.orm import Session
from .. import models
from ..config import settings


def normalize_phone(v) -> str:
    """Приводит телефон к 7XXXXXXXXXX из любых форматов (+7, 8, скобки, пробелы)."""
    if not v:
        return ""
    d = "".join(ch for ch in str(v) if ch.isdigit())
    if len(d) == 11 and d.startswith("8"):
        d = "7" + d[1:]
    return d


def self_order_blocked(db: Session, order: models.Order, executor: models.Executor) -> str | None:
    """Заказ, оформленный на тот же номер телефона, что у исполнителя: брать нельзя.

    Номера из SELF_ORDER_EXEMPT (.env, через запятую) — исключение:
    владелец сервиса может тестировать свои же заказы.
    """
    if not order.client_id or not executor:
        return None
    client = db.query(models.Client).get(order.client_id)
    cp = normalize_phone(client.phone if client else None)
    ep = normalize_phone(executor.phone)
    if not cp or not ep or cp != ep:
        return None
    exempt = {normalize_phone(x) for x in settings.self_order_exempt.split(",")}
    if cp in exempt:
        return None
    return "Это ваш собственный заказ — брать его нельзя"
