from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Notification, Executor
from ..security import get_admin, get_current_executor
from ..services.max_notify import send_max_message

router = APIRouter(tags=["notifications"])


class NotificationIn(BaseModel):
    title: str
    body: str | None = None


@router.get("/notifications")
def list_notifications(max_id: str, db: Session = Depends(get_db)):
    rows = db.query(Notification).filter(
        Notification.user_max_id == max_id
    ).order_by(Notification.id.desc()).limit(50).all()

    return [{
        "id": n.id,
        "title": n.title,
        "body": n.body,
        "order_id": n.order_id,
        "is_read": n.is_read,
        "created_at": n.created_at
    } for n in rows]


@router.put("/notifications/{notification_id}/read")
def read_notification(notification_id: int, db: Session = Depends(get_db)):
    n = db.query(Notification).get(notification_id)
    if not n:
        raise HTTPException(404, "Уведомление не найдено")
    n.is_read = True
    db.commit()
    return {"id": n.id, "is_read": True}


# --- Уведомления исполнителя (по токену) ---
@router.get("/executors/{executor_id}/notifications")
def executor_notifications(
    executor_id: int,
    executor: Executor = Depends(get_current_executor),
    db: Session = Depends(get_db),
):
    """Сервисные уведомления исполнителя: усталость, администратор, фото-контроль.
    События по заказам (order_id) сюда не попадают — они в разделе «Мои заказы»."""
    if executor.id != int(executor_id):
        raise HTTPException(403, "Это не ваш профиль")

    rows = db.query(Notification).filter(
        Notification.user_max_id == str(executor.max_id),
        Notification.category == "service",
    ).order_by(Notification.id.desc()).limit(100).all()

    return {
        "notifications": [{
            "id": n.id,
            "title": n.title,
            "body": n.body,
            "order_id": n.order_id,
            "category": n.category,
            "is_read": bool(n.is_read),
            "created_at": n.created_at.isoformat() if n.created_at else None,
        } for n in rows],
        "unread": sum(1 for n in rows if not n.is_read),
    }


@router.put("/executors/{executor_id}/notifications/{notification_id}/read")
def read_executor_notification(
    executor_id: int,
    notification_id: int,
    executor: Executor = Depends(get_current_executor),
    db: Session = Depends(get_db),
):
    if executor.id != int(executor_id):
        raise HTTPException(403, "Это не ваш профиль")

    n = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_max_id == str(executor.max_id),
    ).first()
    if not n:
        raise HTTPException(404, "Уведомление не найдено")

    n.is_read = True
    db.commit()
    return {"id": n.id, "is_read": True}


@router.put("/executors/{executor_id}/notifications/read-all")
def read_all_executor_notifications(
    executor_id: int,
    executor: Executor = Depends(get_current_executor),
    db: Session = Depends(get_db),
):
    if executor.id != int(executor_id):
        raise HTTPException(403, "Это не ваш профиль")

    rows = db.query(Notification).filter(
        Notification.user_max_id == str(executor.max_id),
        Notification.category == "service",
        Notification.is_read.is_(False),
    ).all()
    for n in rows:
        n.is_read = True
    db.commit()
    return {"ok": True, "unread": 0}


@router.post("/admin/executors/{executor_id}/notifications")
def send_executor_notification(
    executor_id: int,
    data: NotificationIn,
    admin=Depends(get_admin),
    db: Session = Depends(get_db),
):
    """Администратор или оператор пишет исполнителю служебное сообщение."""
    executor = db.query(Executor).filter(Executor.id == executor_id).first()
    if not executor:
        raise HTTPException(404, "Исполнитель не найден")

    title = (data.title or "").strip()
    if not title:
        raise HTTPException(400, "Укажите заголовок")

    row = Notification(
        user_max_id=str(executor.max_id),
        title=title,
        body=(data.body or "").strip() or None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    try:
        send_max_message(
            executor.max_id,
            f"{title}\n{(data.body or '').strip()}".strip(),
            bot="executor",
        )
    except Exception:
        pass

    return {"ok": True, "id": row.id}
