"""Очередь антифрода для оператора/админа (docs/ANTIFRAUD.md §5).

GET  /api/admin/fraud/queue        — пары на проверку (и решённые по запросу)
POST /api/admin/fraud/{id}/resolve — решение человека: confirm_fraud |
                                     false_positive | escalate

Автоматических банов нет — всегда решение человека. Подтверждённый фрод
блокирует клиента (clients.blocked) и отстраняет исполнителя через
ExecutorSuspension (админ может отозвать в «Исполнителях»).
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (
    Client,
    Executor,
    ExecutorSuspension,
    FraudReview,
    FraudSignal,
)
from ..security import get_staff

router = APIRouter(prefix="/api/admin/fraud", tags=["antifraud"])

RESOLVED = ("confirmed", "false_positive")

SIGNAL_LABELS = {
    "same_device_pair": "Одно устройство у клиента и исполнителя",
    "frequent_pair": "Много совместных заказов за неделю",
    "shared_ip_cluster": "Несколько аккаунтов с одного IP",
    "rapid_roundtrip": "Быстрый заказ и повтор той же парой",
    "cancel_after_assign": "Частые отмены после назначения",
    "collusion_rating": "Одинаковые лайки от одного клиента",
    "price_outlier": "Сумма сильно выше медианы",
    "night_cluster": "Ночные заказы пары",
    "cold_pair_big_price": "Первый заказ пары на большую сумму",
}


def _review_payload(db: Session, r: FraudReview) -> dict:
    client = db.query(Client).get(r.client_id) if r.client_id else None
    executor = db.query(Executor).get(r.executor_id) if r.executor_id else None
    signals = (
        db.query(FraudSignal)
        .filter_by(pair_key=r.pair_key, active=True)
        .order_by(FraudSignal.weight.desc())
        .all()
    )
    return {
        "id": r.id,
        "pair_key": r.pair_key,
        "risk_score": r.risk_score,
        "status": r.status,
        "allowlisted": bool(r.allowlisted),
        "client": {
            "id": r.client_id,
            "name": client.name if client else None,
            "phone": client.phone if client else None,
            "blocked": bool(client.blocked) if client else False,
        },
        "executor": {
            "id": r.executor_id,
            "name": executor.name if executor else None,
            "phone": executor.phone if executor else None,
        },
        "signals": [
            {
                "code": s.code,
                "label": SIGNAL_LABELS.get(s.code, s.code),
                "weight": s.weight,
                "meta": s.meta or {},
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in signals
        ],
        "comment": r.comment,
        "resolved_by": r.resolved_by,
        "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


@router.get("/queue")
def fraud_queue(
    show_resolved: bool = False,
    staff=Depends(get_staff),
    db: Session = Depends(get_db),
):
    """Пары на проверку; с решёнными (последние 30) — по запросу."""
    query = db.query(FraudReview)
    if not show_resolved:
        query = query.filter(FraudReview.status.notin_(RESOLVED))
    rows = (
        query.order_by(FraudReview.risk_score.desc(), FraudReview.id.desc())
        .limit(100 if show_resolved else 200)
        .all()
    )
    items = [_review_payload(db, r) for r in rows]
    if show_resolved:
        # Решённые — хвостом, после активных
        items.sort(
            key=lambda x: (x["status"] in RESOLVED, -x["risk_score"])
        )
    return {"items": items}


class ResolveIn(BaseModel):
    action: str                     # confirm_fraud | false_positive | escalate
    comment: str | None = None
    # Отстранение исполнителя при подтверждении, дней (1..3650)
    days: int | None = None


@router.post("/{review_id}/resolve")
def fraud_resolve(
    review_id: int,
    data: ResolveIn,
    staff=Depends(get_staff),
    db: Session = Depends(get_db),
):
    review = db.query(FraudReview).get(review_id)
    if not review:
        raise HTTPException(404, "Запись не найдена")
    if review.status in RESOLVED:
        raise HTTPException(409, "Пара уже решена")
    if data.action not in ("confirm_fraud", "false_positive", "escalate"):
        raise HTTPException(400, "Неизвестное действие")

    who = staff.get("login") or staff.get("role") or "staff"
    now = datetime.utcnow()
    comment = (data.comment or "").strip()[:1000]
    if comment:
        review.comment = comment
    review.resolved_by = who

    if data.action == "confirm_fraud":
        review.status = "confirmed"
        review.resolved_at = now
        # Клиенту — запрет новых заказов (снимается через false_positive)
        client = db.query(Client).get(review.client_id) if review.client_id else None
        if client:
            client.blocked = True
        # Исполнителю — отстранение: таблица и админский интерфейс уже есть
        if review.executor_id:
            days = max(1, min(int(data.days or 90), 3650))
            has_active = (
                db.query(ExecutorSuspension)
                .filter(
                    ExecutorSuspension.executor_id == review.executor_id,
                    ExecutorSuspension.revoked_at.is_(None),
                    ExecutorSuspension.ends_at > now,
                )
                .first()
            )
            if not has_active:
                db.add(ExecutorSuspension(
                    executor_id=review.executor_id,
                    starts_at=now,
                    ends_at=now + timedelta(days=days),
                    reason="Фрод: подтверждено оператором (антифрод)",
                    source="auto",
                    created_by=who,
                ))
    elif data.action == "false_positive":
        review.status = "false_positive"
        review.resolved_at = now
        review.allowlisted = True   # «семья/компания» — больше не беспокоим
        review.risk_score = 0
        # Сигналы гасим: пара проверена, журнал остаётся
        for s in db.query(FraudSignal).filter_by(pair_key=review.pair_key, active=True).all():
            s.active = False
        # Снятие блокировки, если она была выставлена ранее
        client = db.query(Client).get(review.client_id) if review.client_id else None
        if client and client.blocked:
            client.blocked = False
    else:
        # escalate: остаётся на проверке, комментарий и автор решения — выше
        review.status = "review" if review.status == "open" else review.status

    db.commit()
    return {"ok": True, "status": review.status}
