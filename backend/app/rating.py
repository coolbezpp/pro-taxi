"""Рейтинг «батареей»: процент по оценкам за последние 100 заказов.

Оценки ставит противоположная сторона заказа: клиент — исполнителю,
исполнитель — клиенту (like/dislike в таблице ratings). Процент — доля
like среди последних 100 оценок; у нового аккаунта оценок нет, поэтому
рейтинг изначально 100%.

Ниже 80% / 60% / 50% исполнитель получает уведомления о качестве
(один раз на порог, при восстановлении выше 80% сброс). При падении
ниже 50% — временное отстранение от заказов: первое на сутки, повторные
за 90 дней — дольше (72 часа, затем неделя). Администратор может
отстранить и снять отстранение вручную.
"""
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from . import models

WINDOW = 100          # окно: последние оценённые заказы
WARN_PERCENT = 80     # предупреждение о качестве
SERIOUS_PERCENT = 60  # серьёзное предупреждение
SUSPEND_PERCENT = 50  # критично: авто-отстранение от заказов

# Уровни уведомлений (чем меньше номер, тем ниже рейтинг)
_LEVEL_TITLES = {
    3: "Рейтинг упал ниже 80%",
    2: "Рейтинг упал ниже 60%",
    1: "Рейтинг упал ниже 50%",
}
_LEVEL_BODIES = {
    3: "Клиенты оценивают ваши последние поездки ниже обычного. "
       "Следите за качеством сервиса: аккуратность, вежливость, точное время.",
    2: "Ваш рейтинг ниже 60%. Избегайте отказов, опозданий и лишних ожиданий — "
       "рейтинг напрямую влияет на количество предлагаемых заказов.",
    1: "Рейтинг ниже 50%. Новые заказы временно недоступны. "
       "Уже назначенные поездки можно завершить. После восстановления "
       "рейтинга отстранение снимется автоматически.",
}

# Авто-отстранение: длительность по числу отстранений за последние 90 дней
_SUSPEND_HOURS = [24, 72, 168]


def _percent(values):
    if not values:
        return 100
    likes = sum(1 for v in values if v == "like")
    return round(likes * 100 / len(values))


def executor_rating(db: Session, executor) -> dict:
    """Оценки клиентов исполнителю за последние 100 заказов.

    Запрос скреплён с заказом (автор = клиент заказа, исполнитель = он же),
    чтобы id клиентов и исполнителей не пересекались в target_id.
    """
    rows = db.query(models.Rating.value).join(
        models.Order, models.Order.id == models.Rating.order_id
    ).filter(
        models.Rating.target_id == executor.id,
        models.Rating.author_id == models.Order.client_id,
        models.Order.executor_id == executor.id,
    ).order_by(models.Rating.id.desc()).limit(WINDOW).all()
    values = [r[0] for r in rows]
    likes = sum(1 for v in values if v == "like")
    return {
        "percent": _percent(values),
        "likes": likes,
        "dislikes": len(values) - likes,
        "rated": len(values),
        "window": WINDOW,
    }


def client_rating(db: Session, client) -> dict:
    """Оценки исполнителей клиенту за последние 100 заказов."""
    rows = db.query(models.Rating.value).join(
        models.Order, models.Order.id == models.Rating.order_id
    ).filter(
        models.Rating.target_id == client.id,
        models.Rating.author_id == models.Order.executor_id,
        models.Order.client_id == client.id,
    ).order_by(models.Rating.id.desc()).limit(WINDOW).all()
    values = [r[0] for r in rows]
    likes = sum(1 for v in values if v == "like")
    return {
        "percent": _percent(values),
        "likes": likes,
        "dislikes": len(values) - likes,
        "rated": len(values),
        "window": WINDOW,
    }


def update_executor_rating(db: Session, executor) -> dict:
    """Пересчёт кэша процента, уведомления о падении и авто-отстранение.

    Вызывается при поступлении новой оценки. Отстранение создаётся только
    при пересечении порога сверху вниз — новая оценка в красной зоне не
    продлевает отстранение.
    """
    info = executor_rating(db, executor)
    percent = info["percent"]
    previous = executor.rating_percent if executor.rating_percent is not None else 100
    executor.rating_percent = percent

    # Уведомления о качестве: один раз на порог; восстановление выше 80% сбрасывает
    level = None
    if percent < SUSPEND_PERCENT:
        level = 1
    elif percent < SERIOUS_PERCENT:
        level = 2
    elif percent < WARN_PERCENT:
        level = 3

    if level is not None and (
        executor.rating_notified_level is None or level < executor.rating_notified_level
    ):
        db.add(models.Notification(
            user_max_id=str(executor.max_id),
            title=_LEVEL_TITLES[level],
            body=_LEVEL_BODIES[level],
            category="quality",
        ))
        executor.rating_notified_level = level
    elif level is None and executor.rating_notified_level:
        executor.rating_notified_level = None

    # Критическое падение: пересекли 50% сверху вниз → временное отстранение
    suspended = None
    if previous >= SUSPEND_PERCENT > percent:
        suspended = _auto_suspend(db, executor, percent)
    return {**info, "suspended": suspension_json(suspended) if suspended else None}


def update_client_rating(db: Session, client) -> dict:
    """Пересчёт кэша процента клиента (без санкций — только отображение)."""
    info = client_rating(db, client)
    client.rating_percent = info["percent"]
    return info


def active_suspension(db: Session, executor_id: int):
    """Действующее отстранение: не отозванное и с непросроченным сроком."""
    return db.query(models.ExecutorSuspension).filter(
        models.ExecutorSuspension.executor_id == executor_id,
        models.ExecutorSuspension.revoked_at.is_(None),
        models.ExecutorSuspension.ends_at > datetime.utcnow(),
    ).order_by(models.ExecutorSuspension.id.desc()).first()


def suspension_json(s):
    if not s:
        return None
    return {
        "id": s.id,
        "reason": s.reason,
        "source": s.source,
        "starts_at": s.starts_at.isoformat() if s.starts_at else None,
        "ends_at": s.ends_at.isoformat() if s.ends_at else None,
        "revoked_at": s.revoked_at.isoformat() if s.revoked_at else None,
    }


def _auto_suspend(db: Session, executor, percent: int):
    """Авто-отстранение при падении ниже 50%: сутки, повторное за 90 дней —
    72 часа, далее неделя. Исполнитель снимается с линии и получает уведомление."""
    now = datetime.utcnow()
    past = db.query(models.ExecutorSuspension).filter(
        models.ExecutorSuspension.executor_id == executor.id,
        models.ExecutorSuspension.source == "auto",
        models.ExecutorSuspension.created_at >= now - timedelta(days=90),
    ).count()
    hours = _SUSPEND_HOURS[min(past, len(_SUSPEND_HOURS) - 1)]
    suspension = models.ExecutorSuspension(
        executor_id=executor.id,
        starts_at=now,
        ends_at=now + timedelta(hours=hours),
        reason=f"Низкий рейтинг {percent}% — автоматическое отстранение",
        source="auto",
        created_by="system",
    )
    db.add(suspension)
    executor.is_online = False
    db.add(models.Notification(
        user_max_id=str(executor.max_id),
        title="Отстранение от заказов",
        body=f"Рейтинг {percent}% — ниже 50%. Новые заказы недоступны {hours} ч, "
             "уже назначенные поездки завершить можно. Повысьте качество сервиса — "
             "отстранение снимется автоматически.",
        category="quality",
    ))
    return suspension


def suspension_notice(suspension) -> str:
    """Человекочитаемая причина блокировки для 403-ответов."""
    until = suspension.ends_at.strftime("%d.%m %H:%M")
    return f"Исполнитель временно отстранён от заказов до {until}"
