"""Антифрод MVP: device-сессии, сигналы «свой–чужой», скор пары.

Схема и веса — docs/ANTIFRAUD.md §2–4. Ключевые правила:

- Всё, что связано с антифродом, не должно ломать основной сценарий:
  каждая точка входа обёрнута и при ошибке только логирует.
- Скор пары пересчитывается целиком на событиях (назначение, отмена,
  завершение, оценка) — инкрементальная логика склонна к рассинхрону.
- Автобанов нет: при 60+ новые заказы этой пары просто не попадают в
  ленту исполнителя, решение принимает оператор в /admin (вкладка
  «Антифрод»).
"""

import hashlib
import logging
from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..config import settings

_log = logging.getLogger("pro.antifraud")

# Веса сигналов — docs/ANTIFRAUD.md §3
SIGNAL_WEIGHTS = {
    "same_device_pair": 45,        # клиент и исполнитель входили с одного устройства
    "frequent_pair": 25,           # ≥5 совместных заказов за 7 дней при ≤10 всего у клиента
    "shared_ip_cluster": 20,       # с одного ip_hash за неделю ≥3 клиентских аккаунта
    "rapid_roundtrip": 20,         # отмена/завершение <3 мин + повторный заказ парой в час
    "cancel_after_assign": 15,     # клиент отменяет после назначения ≥3 раз за 24 ч
    "collusion_rating": 15,        # клиент ставит лайк одному исполнителю ≥5 раз
    "price_outlier": 15,           # сумма > 2.5 медианы по такой же услуге
    "night_cluster": 10,           # ≥5 заказов пары в 00:00–05:00 (местное) за неделю
    "cold_pair_big_price": 10,     # первый заказ пары > 3000 ₽
}

# Часовой пояс сервиса (Анапа, MSK): server_default=func.now() пишет UTC
_LOCAL_TZ_OFFSET = 3


def _hash(value: str) -> str:
    """Сам IP не храним: sha256(ip + серверный секрет), для кластеров хватает."""
    return hashlib.sha256(f"{settings.jwt_secret}:{value}".encode()).hexdigest()[:32]


def record_device_session(db: Session, request, user_max_id, role: str, device_id) -> None:
    """Запись/обновление устройства входа при логине (клиент или исполнитель)."""
    try:
        did = str(device_id or "").strip()[:64]
        if not user_max_id or not did:
            return
        ip = request.client.host if request and request.client else ""
        ua = (request.headers.get("user-agent", "") if request else "")[:300]
        now = datetime.utcnow()
        row = (
            db.query(models.DeviceSession)
            .filter_by(user_max_id=str(user_max_id), role=role, device_id=did)
            .first()
        )
        if row:
            row.last_seen = now
            if ip:
                row.ip_hash = _hash(ip)
            if ua:
                row.ua_hash = _hash(ua)
        else:
            db.add(models.DeviceSession(
                user_max_id=str(user_max_id),
                role=role,
                device_id=did,
                ip_hash=_hash(ip) if ip else None,
                ua_hash=_hash(ua) if ua else None,
                first_seen=now,
                last_seen=now,
            ))
        db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        _log.exception("antifraud: device session not saved")


def pair_key(client_id, executor_id) -> str:
    return f"{client_id or 0}:{executor_id or 0}"


def pair_under_review(db: Session, client_id, executor_id) -> bool:
    """Пара под подозрением (60+): новые заказы не показываются в ленту."""
    if not client_id or not executor_id:
        return False
    row = (
        db.query(models.FraudReview)
        .filter_by(pair_key=pair_key(client_id, executor_id), status="under_review")
        .first()
    )
    return bool(row)


def evaluate_pair(db: Session, client_id, executor_id) -> None:
    """Полный пересчёт сигналов и риска пары. Никогда не бросает исключений."""
    if not client_id or not executor_id:
        return
    try:
        _evaluate(db, client_id, executor_id)
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        _log.exception("antifraud: evaluate_pair failed for %s:%s", client_id, executor_id)


def _client_max_id(db: Session, client_id) -> str:
    c = db.query(models.Client).get(client_id)
    return str(c.max_id) if c else ""


def _executor_max_id(db: Session, executor_id) -> str:
    e = db.query(models.Executor).get(executor_id)
    return str(e.max_id) if e else ""


def _evaluate(db: Session, client_id: int, executor_id: int) -> None:
    key = pair_key(client_id, executor_id)
    review = (
        db.query(models.FraudReview)
        .filter_by(pair_key=key)
        .first()
    )
    if review and review.allowlisted:
        # «Семья/компания» — проверено человеком, больше не беспокоим
        return

    now = datetime.utcnow()
    d30 = now - timedelta(days=30)
    d7 = now - timedelta(days=7)
    d1 = now - timedelta(days=1)

    active: dict = {}  # code -> meta (вес — из SIGNAL_WEIGHTS)

    orders = (
        db.query(models.Order)
        .filter(
            models.Order.client_id == client_id,
            models.Order.executor_id == executor_id,
            models.Order.created_at >= d30,
        )
        .order_by(models.Order.id.asc())
        .all()
    )
    week_orders = [o for o in orders if o.created_at and o.created_at >= d7]

    # --- same_device_pair: пересечение устройств клиента и исполнителя
    client_max = _client_max_id(db, client_id)
    executor_max = _executor_max_id(db, executor_id)
    if client_max and executor_max:
        client_devices = {
            r[0] for r in db.query(models.DeviceSession.device_id).filter(
                models.DeviceSession.user_max_id == client_max,
                models.DeviceSession.role == "client",
            )
        }
        executor_devices = {
            r[0] for r in db.query(models.DeviceSession.device_id).filter(
                models.DeviceSession.user_max_id == executor_max,
                models.DeviceSession.role == "executor",
            )
        }
        shared = client_devices & executor_devices
        if shared:
            active["same_device_pair"] = {"devices": len(shared)}

    # --- frequent_pair: ≥5 совместных заказов за неделю при маленькой клиентской базе
    if week_orders:
        client_total = (
            db.query(func.count(models.Order.id))
            .filter(models.Order.client_id == client_id)
            .scalar()
            or 0
        )
        if len(week_orders) >= 5 and client_total <= 10:
            active["frequent_pair"] = {
                "week_orders": len(week_orders),
                "client_total": client_total,
            }

    # --- shared_ip_cluster: ip_hash этого клиента за неделю с ≥3 клиентскими аккаунтами
    if client_max:
        ips = [
            r[0]
            for r in db.query(models.DeviceSession.ip_hash).filter(
                models.DeviceSession.user_max_id == client_max,
                models.DeviceSession.role == "client",
                models.DeviceSession.last_seen >= d7,
                models.DeviceSession.ip_hash.isnot(None),
            ).distinct()
        ]
        if ips:
            accounts = (
                db.query(func.count(func.distinct(models.DeviceSession.user_max_id)))
                .filter(
                    models.DeviceSession.role == "client",
                    models.DeviceSession.ip_hash.in_(ips),
                    models.DeviceSession.last_seen >= d7,
                )
                .scalar()
                or 0
            )
            if accounts >= 3:
                active["shared_ip_cluster"] = {"accounts": int(accounts)}

    # --- rapid_roundtrip: очень быстрый заказ + повтор той же парой в течение часа
    if orders:
        events = (
            db.query(models.OrderEvent)
            .filter(
                models.OrderEvent.order_id.in_([o.id for o in orders]),
                models.OrderEvent.event.in_(["completed", "cancelled"]),
            )
            .order_by(models.OrderEvent.id.asc())
            .all()
        )
        ev_by_order: dict = {}
        for e in events:
            ev_by_order.setdefault(e.order_id, []).append(e)
        for o in orders:
            evs = ev_by_order.get(o.id) or []
            if not evs or not o.created_at:
                continue
            fast = any(
                e.created_at and e.created_at - o.created_at < timedelta(minutes=3)
                for e in evs
            )
            if not fast:
                continue
            done_at = max((e.created_at for e in evs if e.created_at), default=None)
            if not done_at:
                continue
            repeat = (
                db.query(models.Order)
                .filter(
                    models.Order.client_id == client_id,
                    models.Order.executor_id == executor_id,
                    models.Order.id > o.id,
                    models.Order.created_at <= done_at + timedelta(hours=1),
                )
                .first()
            )
            if repeat:
                active["rapid_roundtrip"] = {"order_id": o.id, "repeat_id": repeat.id}
                break

    # --- cancel_after_assign: клиент отменяет назначенные заказы ≥3 раза за сутки
    cancels = (
        db.query(func.count(func.distinct(models.Order.id)))
        .join(models.OrderEvent, models.OrderEvent.order_id == models.Order.id)
        .filter(
            models.Order.client_id == client_id,
            models.Order.executor_id.isnot(None),
            models.OrderEvent.event == "cancelled",
            models.OrderEvent.created_at >= d1,
        )
        .scalar()
        or 0
    )
    if cancels >= 3:
        active["cancel_after_assign"] = {"cancels_24h": int(cancels)}

    # --- collusion_rating: клиент жмёт лайк одному исполнителю ≥5 раз
    likes = (
        db.query(func.count(models.Rating.id))
        .filter(
            models.Rating.author_id == client_id,
            models.Rating.target_id == executor_id,
            models.Rating.value == "like",
        )
        .scalar()
        or 0
    )
    if likes >= 5:
        active["collusion_rating"] = {"likes": int(likes)}

    # --- night_cluster: ≥5 парных заказов ночью (местное время 00:00–05:00) за неделю
    night = [
        o for o in week_orders
        if o.created_at and 0 <= (o.created_at.hour + _LOCAL_TZ_OFFSET) % 24 < 5
    ]
    if len(night) >= 5:
        active["night_cluster"] = {"night_week": len(night)}

    # --- cold_pair_big_price: первый заказ пары на большую сумму
    if not orders:
        first = (
            db.query(models.Order)
            .filter(
                models.Order.client_id == client_id,
                models.Order.executor_id == executor_id,
            )
            .order_by(models.Order.id.asc())
            .first()
        )
        if first and (first.total_price or 0) > 3000:
            active["cold_pair_big_price"] = {
                "order_id": first.id,
                "price": round(first.total_price or 0),
            }

    # --- price_outlier: последний парный заказ резко выше медианы по услуге
    if orders:
        latest = orders[-1]
        median = (
            db.query(func.percentile_cont(0.5).within_group(models.Order.total_price))
            .filter(
                models.Order.service == latest.service,
                models.Order.status == "completed",
                models.Order.created_at >= now - timedelta(days=90),
            )
            .scalar()
        )
        if median and median > 0 and (latest.total_price or 0) > median * 2.5:
            active["price_outlier"] = {
                "order_id": latest.id,
                "price": round(latest.total_price or 0),
                "median": round(float(median), 1),
            }

    # --- синхронизация сигналов: живые — upsert, снятые — active=False (журнал остаётся)
    for code in SIGNAL_WEIGHTS:
        row = (
            db.query(models.FraudSignal)
            .filter_by(pair_key=key, code=code)
            .order_by(models.FraudSignal.id.desc())
            .first()
        )
        if code in active:
            weight = SIGNAL_WEIGHTS[code]
            if row and row.active:
                row.weight = weight
                row.meta = active[code]
                row.created_at = now  # «активен сейчас» — окно 30 дней
            else:
                db.add(models.FraudSignal(
                    pair_key=key,
                    code=code,
                    weight=weight,
                    meta=active[code],
                    active=True,
                ))
        elif row and row.active:
            row.active = False

    db.flush()

    score = (
        db.query(func.coalesce(func.sum(models.FraudSignal.weight), 0))
        .filter(
            models.FraudSignal.pair_key == key,
            models.FraudSignal.active.is_(True),  # noqa: FBT
            models.FraudSignal.created_at >= d30,
        )
        .scalar()
        or 0
    )
    score = min(100.0, float(score))

    if not review:
        review = models.FraudReview(
            pair_key=key,
            client_id=client_id,
            executor_id=executor_id,
            risk_score=score,
            status="open",
        )
        db.add(review)
    else:
        review.risk_score = score
        # Ручные решения (confirmed / false_positive) автоматика не трогает
        if review.status not in ("confirmed", "false_positive"):
            if score >= 60:
                review.status = "under_review"
            elif score >= 30:
                review.status = "review"
            else:
                review.status = "open"
        review.updated_at = now

    db.commit()
    if score >= 60:
        _log.warning(
            "ANTIFRAUD pair %s risk=%.0f -> under_review (клиент %s, исполнитель %s)",
            key, score, client_max, executor_max,
        )
