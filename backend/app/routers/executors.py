import json
import os
import hmac
import hashlib
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwt, JWTError
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import (
    Executor, ExecutorRole, Order, ExecutorBalanceOp, ExecutorPhotoCheck,
    Notification, OperatorMessage,
)
from ..config import settings
from ..security import bearer_scheme, create_token, get_admin, get_current_executor
from .. import worktime
from ..services.max_notify import send_max_message

router = APIRouter(prefix="/api", tags=["executors"])

ROLES = ["driver", "courier", "cargo", "master", "car_owner", "flat_owner"]
ACTIVE_STATUSES = ["assigned", "accepted", "in_progress"]

# Максимальный размер фото, присылаемого исполнителем (data-URL).
# Приложение сжимает снимок сам (до ~1.5 МБ), лимит — запас на сетевые обрывы.
MAX_PHOTO_BYTES = 5 * 1024 * 1024

# Типы фото-контроля — как у конкурентов (авто, документы, селфи, номер).
PHOTO_KINDS = {
    "car": "Фото автомобиля",
    "documents": "Фото документов",
    "selfie": "Селфи исполнителя",
    "plate": "Фото номера",
}
PHOTO_KIND_TITLES = dict(PHOTO_KINDS)
_MONTH_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]


def _month_short(month: int) -> str:
    return _MONTH_SHORT[max(1, min(int(month), 12)) - 1]


def _available_months(now: datetime):
    """Шесть последних месяцев от текущего — по хронологии."""
    months = []
    y, m = now.year, now.month
    for _ in range(6):
        months.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    months.reverse()
    return months

class AuthIn(BaseModel):
    initData: str
    role: str

class RoleIn(BaseModel):
    role: str


class ExecutorContactAuthIn(BaseModel):
    initData: str
    contact: dict


class PhotoCheckIn(BaseModel):
    title: str | None = None
    comment: str | None = None
    kind: str = "car"
    photo_url: str | None = None
    captured_at: int | None = None


class PhotoCheckAnswerIn(BaseModel):
    photo_url: str
    status: str = "answered"  # answered | approved | rejected
    captured_at: int | None = None


# Фото-контроль принимает только свежий снимок с камеры (не из галереи)
MAX_PHOTO_AGE_SECONDS = 5 * 60


def _require_fresh_capture(captured_at):
    """Проверяем, что снимок сделан только что — старые файлы из галереи не принимаем."""
    if not captured_at:
        raise HTTPException(400, "Укажите время снимка — фото должно быть сделано сейчас")
    try:
        ts = int(captured_at)
        # Приложение присылает время в миллисекундах — приводим к секундам
        if ts > 10**11:
            ts //= 1000
        age = int(datetime.utcnow().timestamp()) - ts
    except (TypeError, ValueError):
        raise HTTPException(400, "Некорректное время снимка")
    if age > MAX_PHOTO_AGE_SECONDS:
        raise HTTPException(400, "Нужен свежий снимок с камеры — фото из галереи не подходит")
    if age < -60:
        raise HTTPException(400, "Время снимка некорректно")


def _executor_bot_token() -> str:
    token = getattr(settings, "max_executor_bot_token", "") or os.getenv("MAX_EXECUTOR_BOT_TOKEN", "")
    token = (token or "").strip()
    if not token or token == "your_max_bot_token":
        raise HTTPException(503, "Авторизация исполнителя временно недоступна")
    return token


def _validate_executor_init_data(init_data: str) -> str:
    from urllib.parse import parse_qsl

    token = _executor_bot_token()
    pairs = parse_qsl(init_data, keep_blank_values=True)
    values = {}
    for key, value in pairs:
        if key in values:
            raise HTTPException(401, "Некорректные данные MAX")
        values[key] = value

    received_hash = values.pop("hash", None)
    if not received_hash:
        raise HTTPException(401, "Не передана подпись MAX")

    check_string = "\n".join(f"{k}={v}" for k, v in sorted(values.items()))
    inner_key = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    expected = hmac.new(inner_key, check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected, received_hash.lower()):
        raise HTTPException(401, "Не пройдена проверка данных MAX")

    try:
        user = json.loads(values["user"])
    except Exception:
        raise HTTPException(401, "Не удалось прочитать пользователя MAX")

    max_id = user.get("id")
    if not max_id:
        raise HTTPException(401, "В данных MAX нет пользователя")
    return str(max_id)


def _validate_executor_contact(contact: dict, max_id: str) -> str:
    token = _executor_bot_token()

    auth_date = str(contact.get("authDate") or "")
    phone = str(contact.get("phone", "")).strip()
    received_hash = str(contact.get("hash", "")).lower()

    if not all([auth_date, phone, received_hash]):
        raise HTTPException(401, "Не подтверждён номер телефона")

    normalized_phone = phone[1:] if phone.startswith("+") else phone
    messages = [
        auth_date + phone,
        auth_date + normalized_phone,
        auth_date + phone + max_id,
        auth_date + normalized_phone + max_id,
        f"authDate={auth_date}\nphone={phone}",
        f"authDate={auth_date}\nphone={normalized_phone}",
        f"authDate={auth_date}\nphone={phone}\nuserId={max_id}",
        f"authDate={auth_date}\nphone={normalized_phone}\nuserId={max_id}",
    ]

    inner_key = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    candidates = []
    for message in messages:
        raw = message.encode()
        candidates.extend([
            hmac.new(inner_key, raw, hashlib.sha256).hexdigest(),
            hmac.new(token.encode(), raw, hashlib.sha256).hexdigest(),
            hashlib.sha256(message.encode() + token.encode()).hexdigest(),
        ])

    if received_hash not in candidates:
        raise HTTPException(401, "Не пройдена проверка номера телефона")

    return phone

def has_active_order(db, executor_id):
    return (
        db.query(Order)
        .filter(
            Order.status.in_(ACTIVE_STATUSES),
            Order.driver_id == executor_id,
        )
        .first()
    )


def executor_roles(db, executor_id):
    return [
        r.role
        for r in db.query(ExecutorRole)
        .filter_by(executor_id=executor_id)
        .all()
    ]

def parse_max_user(init_data: str):
    try:
        data = json.loads(init_data)
        user = data.get("user") or {}
        return user.get("id"), user.get("first_name") or user.get("username") or ""
    except Exception:
        pass

    from urllib.parse import parse_qs

    values = parse_qs(init_data)
    user_raw = values.get("user", [None])[0]

    if not user_raw:
        return None, ""

    user = json.loads(user_raw)
    return user.get("id"), user.get("first_name") or user.get("username") or ""


def _max_user_name(init_data: str) -> str:
    """Имя из проверенных данных MAX (без повторной проверки подписи)."""
    from urllib.parse import parse_qs

    values = parse_qs(init_data)
    user_raw = values.get("user", [None])[0]
    if user_raw:
        try:
            user = json.loads(user_raw)
            return user.get("first_name") or user.get("username") or ""
        except Exception:
            return ""
    return ""


def _require_same(executor: Executor, executor_id: int):
    if executor.id != int(executor_id):
        raise HTTPException(status_code=403, detail="Это не ваш профиль")
    return executor


@router.post("/executors/auth")
def auth_executor(data: AuthIn, db: Session = Depends(get_db)):
    if data.role not in ROLES:
        raise HTTPException(400, "Неизвестная роль")

    # Подпись MAX обязательна: без неё нельзя войти под чужим аккаунтом
    max_id = _validate_executor_init_data(data.initData)
    name = _max_user_name(data.initData)

    executor = db.query(Executor).filter(Executor.max_id == str(max_id)).first()
    # Создание исполнителя возможно только через подтверждение номера:
    # /executors/auth/contact (ContactGate), здесь — только вход существующих.
    if not executor or not getattr(executor, "phone", None):
        raise HTTPException(403, "Подтвердите номер в приложении исполнителя")

    if name:
        executor.name = name
    if data.role not in executor_roles(db, executor.id):
        db.add(ExecutorRole(executor_id=executor.id, role=data.role))
    if not executor.active_role:
        executor.active_role = data.role

    db.commit()
    db.refresh(executor)

    profile = executor_profile(db, executor)
    profile["token"] = create_token(executor.id, "executor")
    return profile

@router.post("/executors/auth/contact")
def auth_executor_contact(data: ExecutorContactAuthIn, db: Session = Depends(get_db)):
    max_id = _validate_executor_init_data(data.initData)
    phone = _validate_executor_contact(data.contact, max_id)

    executor = db.query(Executor).filter(Executor.max_id == max_id).first()
    if not executor:
        executor = Executor(
            max_id=max_id,
            name="",
            role="driver",
            active_role="driver",
            status="pending",
            phone=phone,
        )
        db.add(executor)
        db.commit()
        db.refresh(executor)
        db.add(ExecutorRole(executor_id=executor.id, role="driver"))
    else:
        executor.phone = phone

    db.commit()
    db.refresh(executor)
    return {
        "ok": True,
        "executor_id": executor.id,
        "phone": phone,
        "token": create_token(executor.id, "executor"),
    }


def executor_profile(db: Session, executor: Executor):
    return {
        "id": executor.id,
        "max_id": executor.max_id,
        "name": executor.name,
        "phone": executor.phone,
        "roles": executor_roles(db, executor.id),
        "active_role": executor.active_role,
        "status": executor.status,
        "balance": float(executor.balance or 0),
        "rating_likes": int(executor.rating_likes or 0),
        "rating_dislikes": int(executor.rating_dislikes or 0),
        "is_online": bool(executor.is_online),
        "skip_streak": int(executor.skip_streak or 0),
    }

def get_executor(db: Session, executor_id: int):
    executor = db.query(Executor).filter(Executor.id == executor_id).first()
    if not executor:
        raise HTTPException(404, "Исполнитель не найден")
    return executor


class OperatorMessageIn(BaseModel):
    text: str


@router.get("/messages")
def executor_messages(
    executor: Executor = Depends(get_current_executor),
    db: Session = Depends(get_db),
):
    """Переписка исполнителя с оператором."""
    rows = (
        db.query(OperatorMessage)
        .filter(OperatorMessage.executor_id == executor.id)
        .order_by(OperatorMessage.id.asc())
        .limit(200)
        .all()
    )
    return {
        "messages": [{
            "id": row.id,
            "author_role": row.author_role,
            "text": row.text,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        } for row in rows],
        "unread": sum(1 for row in rows if row.author_role != "executor" and not row.is_read),
    }


@router.post("/messages")
def send_operator_message(
    data: OperatorMessageIn,
    executor: Executor = Depends(get_current_executor),
    db: Session = Depends(get_db),
):
    """Исполнитель пишет оператору — сообщение попадёт в админку."""
    text = (data.text or "").strip()
    if not text:
        raise HTTPException(400, "Пустое сообщение")

    row = OperatorMessage(
        executor_id=executor.id,
        author_role="executor",
        text=text[:2000],
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "ok": True,
        "id": row.id,
        "author_role": row.author_role,
        "text": row.text,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


# --- Канал оператора: админка ---
@router.get("/admin/messages")
def admin_messages(admin=Depends(get_admin), db: Session = Depends(get_db)):
    """Лента сообщений от исполнителей и системных событий."""
    rows = (
        db.query(OperatorMessage)
        .order_by(OperatorMessage.id.desc())
        .limit(200)
        .all()
    )
    items = []
    for row in rows:
        executor = db.query(Executor).filter(Executor.id == row.executor_id).first()
        items.append({
            "id": row.id,
            "executor_id": row.executor_id,
            "executor_name": (executor.name if executor else None) or "Исполнитель",
            "executor_phone": executor.phone if executor else None,
            "author_role": row.author_role,
            "text": row.text,
            "is_read": bool(row.is_read),
            "created_at": row.created_at.isoformat() if row.created_at else None,
        })
    return {
        "messages": items,
        "unread": sum(1 for i in items if not i["is_read"]),
    }


@router.post("/admin/messages")
def admin_send_message(
    data: OperatorMessageIn,
    executor_id: int,
    admin=Depends(get_admin),
    db: Session = Depends(get_db),
):
    """Админ/оператор отвечает исполнителю."""
    executor = get_executor(db, executor_id)
    text = (data.text or "").strip()
    if not text:
        raise HTTPException(400, "Пустое сообщение")

    row = OperatorMessage(
        executor_id=executor.id,
        author_role="admin",
        text=text[:2000],
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    db.add(Notification(
        user_max_id=str(executor.max_id),
        title="Сообщение от оператора",
        body=text[:500],
    ))
    db.commit()
    try:
        send_max_message(executor.max_id, f"Сообщение от оператора:\n{text[:500]}", bot="executor")
    except Exception:
        pass

    return {"ok": True, "id": row.id}


@router.put("/admin/messages/{message_id}/read")
def admin_read_message(
    message_id: int,
    admin=Depends(get_admin),
    db: Session = Depends(get_db),
):
    row = db.query(OperatorMessage).filter(OperatorMessage.id == message_id).first()
    if not row:
        raise HTTPException(404, "Сообщение не найдено")
    row.is_read = True
    db.commit()
    return {"ok": True, "id": row.id}


def _system_message(db, executor_id: int, text: str):
    """Служебное событие в ленте оператора (например, запрос фото-контроля)."""
    db.add(OperatorMessage(
        executor_id=executor_id,
        author_role="system",
        text=text[:2000],
    ))
    db.commit()


@router.get("/admin/executors/{executor_id}/profile")
def admin_executor_profile(
    executor_id: int,
    admin=Depends(get_admin),
    db: Session = Depends(get_db),
):
    """Полная карточка исполнителя для админки: смена, баланс, фото-контроли, заказы."""
    executor = get_executor(db, executor_id)

    try:
        work = worktime.work_state(db, executor_id)
    except Exception:
        work = {"status": "ok", "worked_minutes": 0, "remaining_minutes": 720,
                "limit_minutes": 720, "rest_minutes": 360, "started_at": None,
                "rest_until": None}

    ops = db.query(ExecutorBalanceOp).filter(
        ExecutorBalanceOp.executor_id == executor_id
    ).order_by(ExecutorBalanceOp.id.desc()).limit(50).all()

    photos = db.query(ExecutorPhotoCheck).filter(
        ExecutorPhotoCheck.executor_id == executor_id
    ).order_by(ExecutorPhotoCheck.id.desc()).limit(50).all()

    orders = db.query(Order).filter(
        Order.driver_id == executor_id
    ).order_by(Order.id.desc()).limit(20).all()

    return {
        "executor": {
            "id": executor.id,
            "max_id": executor.max_id,
            "name": executor.name,
            "phone": executor.phone,
            "status": executor.status,
            "active_role": executor.active_role,
            "roles": executor_roles(db, executor_id),
            "balance": round(float(executor.balance or 0), 2),
            "rating_likes": int(executor.rating_likes or 0),
            "rating_dislikes": int(executor.rating_dislikes or 0),
            "is_online": bool(executor.is_online),
            "skip_streak": int(executor.skip_streak or 0),
            "last_seen_at": executor.last_seen_at.isoformat() if executor.last_seen_at else None,
            "created_at": executor.created_at.isoformat() if executor.created_at else None,
        },
        "work": work,
        "balance_ops": [{
            "id": op.id,
            "type": op.type,
            "amount": round(float(op.amount or 0), 2),
            "order_id": op.order_id,
            "comment": op.comment,
            "created_at": op.created_at.isoformat() if op.created_at else None,
        } for op in ops],
        "photo_checks": [_photo_check_json(p) for p in photos],
        "orders": [{
            "id": o.id,
            "status": o.status,
            "from_address": o.from_address,
            "to_address": o.to_address,
            "total_price": o.total_price,
            "created_at": o.created_at.isoformat() if o.created_at else None,
        } for o in orders],
    }


@router.get("/executors/{executor_id}")
def get_profile(
    executor_id: int,
    executor: Executor = Depends(get_current_executor),
    db: Session = Depends(get_db),
):
    _require_same(executor, executor_id)
    return executor_profile(db, get_executor(db, executor_id))


@router.get("/executors/{executor_id}/balance-history")
def balance_history(
    executor_id: int,
    days: int = 30,
    month: str | None = None,
    executor: Executor = Depends(get_current_executor),
    db: Session = Depends(get_db),
):
    """Статистика по балансу: за последние 7 дней или по неделям выбранного месяца."""
    _require_same(executor, executor_id)
    now = datetime.utcnow()

    # Заработок — по завершённым заказам (выплата = сумма − комиссия)
    orders = db.query(Order).filter(
        Order.driver_id == executor_id,
        Order.status == "completed",
    ).all()

    earned_by_day_all = {}
    months_with_data = set()
    for o in orders:
        payout = round((o.total_price or 0) - (o.commission_amount or 0), 2)
        created = o.created_at or o.id
        day = created.date() if hasattr(created, "date") else None
        if day is None:
            continue
        months_with_data.add(f"{day.year:04d}-{day.month:02d}")
        key = day.isoformat()
        earned_by_day_all[key] = round(earned_by_day_all.get(key, 0.0) + payout, 2)

    available = _available_months(now)

    # Режим по умолчанию — последние 7 дней
    if not month:
        today = now.date()
        week_ago = today - timedelta(days=6)
        days_list = []
        for i in range(7):
            day = week_ago + timedelta(days=i)
            amount = earned_by_day_all.get(day.isoformat(), 0.0)
            days_list.append({
                "date": day.isoformat(),
                "label": f"{day.day} {_month_short(day.month)}",
                "weekday": ["пн", "вт", "ср", "чт", "пт", "сб", "вс"][day.weekday()],
                "amount": amount,
            })

        ops = db.query(ExecutorBalanceOp).filter(
            ExecutorBalanceOp.executor_id == executor_id,
            ExecutorBalanceOp.created_at >= now - timedelta(days=7),
        ).order_by(ExecutorBalanceOp.id.desc()).all()

        topups = [
            {
                "id": op.id,
                "amount": round(float(op.amount or 0), 2),
                "comment": op.comment,
                "created_at": op.created_at.isoformat() if op.created_at else None,
            }
            for op in ops
            if op.type in ("topup", "correction")
        ]

        return {
            "balance": round(float(executor.balance or 0), 2),
            "period": "7d",
            "period_label": "последние 7 дней",
            "month": None,
            "month_label": None,
            "available_months": available,
            "months_with_data": sorted(months_with_data, reverse=True),
            "total_earned": round(sum(d["amount"] for d in days_list), 2),
            "days": days_list,
            "weeks": [],
            "earned_by_day": [
                {"date": d["date"], "amount": d["amount"]} for d in days_list
            ],
            "topups": topups,
            "total_topped_up": round(sum(t["amount"] for t in topups if t["amount"] > 0), 2),
        }

    # Выбранный месяц: помесячная статистика с разбивкой по неделям
    try:
        year, mon = [int(x) for x in str(month).split("-")[:2]]
    except Exception:
        raise HTTPException(400, "Некорректный месяц")
    if mon < 1 or mon > 12:
        raise HTTPException(400, "Некорректный месяц")

    month_start = datetime(year, mon, 1)
    month_end = datetime(year + 1, 1, 1) if mon == 12 else datetime(year, mon + 1, 1)

    month_names = [
        "январь", "февраль", "март", "апрель", "май", "июнь",
        "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
    ]
    month_label = f"{month_names[mon - 1]} {year}"

    by_day = {
        key: amount
        for key, amount in earned_by_day_all.items()
        if month_start.date() <= datetime.strptime(key, "%Y-%m-%d").date() < month_end.date()
    }

    total_earned = round(sum(by_day.values()), 2)

    # Разбивка по неделям внутри месяца (недели — с понедельника).
    # Корзины строим для всего месяца, чтобы график не «исчезал».
    week_buckets = {}
    for key, amount in by_day.items():
        day = datetime.strptime(key, "%Y-%m-%d").date()
        week_start = day - timedelta(days=day.weekday())
        week_buckets.setdefault(week_start, []).append((day, amount))

    weeks = []
    first_week = month_start.date() - timedelta(days=month_start.weekday())
    last_day = (month_end - timedelta(days=1)).date()
    last_week = last_day - timedelta(days=last_day.weekday())
    week_start = first_week
    while week_start <= last_week:
        week_end = min(week_start + timedelta(days=6), last_day)
        items = week_buckets.get(week_start, [])
        amount = round(sum(a for _, a in items), 2)
        # Подпись — только по дням выбранного месяца
        label_from = max(week_start, month_start.date())
        weeks.append({
            "start": week_start.isoformat(),
            "end": week_end.isoformat(),
            "label": f"{label_from.day}–{week_end.day} {_month_short(mon)}",
            "amount": amount,
        })
        week_start += timedelta(days=7)

    # Пополнения и корректировки за выбранный месяц
    ops = db.query(ExecutorBalanceOp).filter(
        ExecutorBalanceOp.executor_id == executor_id,
        ExecutorBalanceOp.created_at >= month_start,
        ExecutorBalanceOp.created_at < month_end,
    ).order_by(ExecutorBalanceOp.id.desc()).all()

    topups = [
        {
            "id": op.id,
            "amount": round(float(op.amount or 0), 2),
            "comment": op.comment,
            "created_at": op.created_at.isoformat() if op.created_at else None,
        }
        for op in ops
        if op.type in ("topup", "correction")
    ]

    return {
        "balance": round(float(executor.balance or 0), 2),
        "days": days,
        "period": "month",
        "period_label": month_label,
        "month": f"{year:04d}-{mon:02d}",
        "month_label": month_label,
        "available_months": available,
        "months_with_data": sorted(months_with_data, reverse=True),
        "total_earned": total_earned,
        "weeks": weeks,
        "days": [],
        "earned_by_day": [
            {"date": key, "amount": value}
            for key, value in sorted(by_day.items())
        ],
        "topups": topups,
        "total_topped_up": round(sum(t["amount"] for t in topups if t["amount"] > 0), 2),
    }


@router.post("/executors/{executor_id}/online")
def set_online(
    executor_id: int,
    data: dict,
    executor: Executor = Depends(get_current_executor),
    db: Session = Depends(get_db),
):
    """Исполнитель выходит на линию / уходит с неё."""
    _require_same(executor, executor_id)
    value = bool(data.get("online", False))
    executor.is_online = value
    if value:
        # Вернулся на линию — счётчик пропусков обнуляем
        executor.skip_streak = 0
    db.commit()
    return {"ok": True, "is_online": executor.is_online, "skip_streak": executor.skip_streak}


@router.post("/orders/{order_id}/skip")
def skip_order(
    order_id: int,
    data: dict,
    executor: Executor = Depends(get_current_executor),
    db: Session = Depends(get_db),
):
    """Исполнитель пропустил заказ. Два пропуска подряд — снятие с линии."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Заказ не найден")

    if data.get("executor_id") and int(data["executor_id"]) != executor.id:
        raise HTTPException(403, "Это не ваш заказ")

    if order.status != "created":
        return {"ok": True, "skip_streak": executor.skip_streak, "taken_offline": False}

    executor.skip_streak = int(executor.skip_streak or 0) + 1
    taken_offline = False

    if executor.skip_streak >= 2:
        executor.skip_streak = 0
        executor.is_online = False
        taken_offline = True
        db.add(Notification(
            user_max_id=str(executor.max_id),
            title="Вы сняты с линии",
            body="Пропущено два заказа подряд — доступ к заказам отключён. Выйдите на линию снова, когда будете готовы.",
        ))
        db.commit()
        try:
            send_max_message(
                executor.max_id,
                "Пропущено два заказа подряд — вы сняты с линии. "
                "Вернитесь на линию, когда сможете брать заказы.",
                bot="executor",
            )
        except Exception:
            pass
        return {"ok": True, "skip_streak": 0, "taken_offline": True}

    db.commit()
    return {"ok": True, "skip_streak": executor.skip_streak, "taken_offline": False}


@router.get("/executors/{executor_id}/work-time")
def work_time(
    executor_id: int,
    executor: Executor = Depends(get_current_executor),
    db: Session = Depends(get_db),
):
    """Состояние рабочего времени исполнителя: лимит 12 ч, предупреждение, отдых."""
    _require_same(executor, executor_id)
    state = worktime.work_state(db, executor_id)

    # За 2 часа до блокировки предупреждаем один раз за смену
    if worktime.should_warn(db, executor_id):
        worktime.mark_warned(db, executor_id)
        left = state.get("remaining_minutes", 0)
        hours = left // 60
        minutes = left % 60
        text = (
            f"Доступ к заказам будет ограничен через {hours} ч {minutes} мин. "
            "Лимит рабочего времени — 12 часов в сутки."
        )
        db.add(Notification(
            user_max_id=str(executor.max_id),
            title="Скоро ограничение доступа к заказам",
            body=text,
        ))
        db.commit()
        try:
            send_max_message(executor.max_id, text, bot="executor")
        except Exception:
            pass

    return state


@router.post("/executors/{executor_id}/work-session/stop")
def stop_work_session(
    executor_id: int,
    executor: Executor = Depends(get_current_executor),
    db: Session = Depends(get_db),
):
    """Завершить смену: дальше — отдых 6 часов."""
    _require_same(executor, executor_id)
    return worktime.stop_session(db, executor_id)


def _photo_check_json(row):
    return {
        "id": row.id,
        "executor_id": row.executor_id,
        "kind": row.kind or "car",
        "title": row.title,
        "comment": row.comment,
        "status": row.status,
        "photo_url": row.photo_url,
        "decision_comment": row.decision_comment,
        "decided_at": row.decided_at.isoformat() if row.decided_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "answered_at": row.answered_at.isoformat() if row.answered_at else None,
    }


@router.get("/executors/{executor_id}/photo-checks")
def list_photo_checks(
    executor_id: int,
    executor: Executor = Depends(get_current_executor),
    db: Session = Depends(get_db),
):
    """История фото-контролей исполнителя: запросы оператора и решения модератора."""
    _require_same(executor, executor_id)
    rows = db.query(ExecutorPhotoCheck).filter(
        ExecutorPhotoCheck.executor_id == executor_id
    ).order_by(ExecutorPhotoCheck.id.desc()).limit(50).all()
    return [_photo_check_json(row) for row in rows]


@router.post("/executors/{executor_id}/photo-checks")
def create_photo_check(
    executor_id: int,
    data: PhotoCheckIn,
    executor: Executor = Depends(get_current_executor),
    db: Session = Depends(get_db),
):
    """Исполнитель сам присылает фото на проверку (авто, документы, селфи)."""
    _require_same(executor, executor_id)
    kind = (data.kind or "car").strip()
    if kind not in PHOTO_KINDS:
        raise HTTPException(400, "Неизвестный тип фото")

    title = (data.title or "").strip() or PHOTO_KIND_TITLES.get(kind, "Фото на проверку")
    photo_url = (data.photo_url or "").strip()
    if not photo_url:
        raise HTTPException(400, "Приложите фото")
    if len(photo_url.encode("utf-8")) > MAX_PHOTO_BYTES:
        raise HTTPException(413, "Фото слишком большое даже после сжатия — попробуйте ещё раз")
    _require_fresh_capture(data.captured_at)

    row = ExecutorPhotoCheck(
        executor_id=executor_id,
        kind=kind,
        title=title,
        comment=(data.comment or "").strip() or None,
        status="pending",
        photo_url=photo_url,
        answered_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _photo_check_json(row)


@router.put("/executors/{executor_id}/photo-checks/{check_id}")
def answer_photo_check(
    executor_id: int,
    check_id: int,
    data: PhotoCheckAnswerIn,
    executor: Executor = Depends(get_current_executor),
    db: Session = Depends(get_db),
):
    """Исполнитель отвечает на запрос оператора — присылает фото."""
    _require_same(executor, executor_id)
    row = db.query(ExecutorPhotoCheck).filter(
        ExecutorPhotoCheck.id == check_id,
        ExecutorPhotoCheck.executor_id == executor_id,
    ).first()
    if not row:
        raise HTTPException(404, "Заявка не найдена")

    photo_url = (data.photo_url or "").strip()
    if not photo_url:
        raise HTTPException(400, "Приложите фото")
    if len(photo_url.encode("utf-8")) > MAX_PHOTO_BYTES:
        raise HTTPException(413, "Фото слишком большое даже после сжатия — попробуйте ещё раз")
    _require_fresh_capture(data.captured_at)

    row.photo_url = photo_url
    row.status = "pending"
    row.answered_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _photo_check_json(row)


# --- Фото-контроль со стороны админки ---
@router.get("/admin/photo-checks")
def admin_photo_checks(admin=Depends(get_admin), db: Session = Depends(get_db)):
    """Список всех проверок с данными исполнителя."""
    rows = (
        db.query(ExecutorPhotoCheck)
        .order_by(ExecutorPhotoCheck.id.desc())
        .limit(200)
        .all()
    )
    result = []
    for row in rows:
        item = _photo_check_json(row)
        executor = db.query(Executor).filter(Executor.id == row.executor_id).first()
        item["executor_name"] = (executor.name if executor else None) or "Исполнитель"
        item["executor_phone"] = executor.phone if executor else None
        item["executor_status"] = executor.status if executor else None
        result.append(item)
    return {"photo_checks": result}


@router.post("/admin/executors/{executor_id}/photo-checks")
def admin_request_photo_check(
    executor_id: int,
    data: PhotoCheckIn,
    admin=Depends(get_admin),
    db: Session = Depends(get_db),
):
    """Оператор/модератор запрашивает у исполнителя фото."""
    executor = get_executor(db, executor_id)
    kind = (data.kind or "car").strip()
    if kind not in PHOTO_KINDS:
        raise HTTPException(400, "Неизвестный тип фото")

    title = (data.title or "").strip() or PHOTO_KIND_TITLES.get(kind, "Пришлите фото")
    row = ExecutorPhotoCheck(
        executor_id=executor_id,
        kind=kind,
        title=title,
        comment=(data.comment or "").strip() or None,
        status="requested",
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    text = f"Фото-контроль: {title}. Откройте приложение исполнителя и пришлите фото."
    db.add(Notification(
        user_max_id=str(executor.max_id),
        title="Требуется фото",
        body=text,
    ))
    db.commit()
    _system_message(db, executor_id, f"Запрошено фото: {title} (исполнитель {(executor.name or '').upper() or '—'})")
    try:
        send_max_message(executor.max_id, text, bot="executor")
    except Exception:
        pass

    return _photo_check_json(row)


@router.put("/admin/photo-checks/{check_id}")
def admin_decide_photo_check(
    check_id: int,
    data: dict,
    admin=Depends(get_admin),
    db: Session = Depends(get_db),
):
    """Модератор принимает или отклоняет присланное фото."""
    row = db.query(ExecutorPhotoCheck).filter(ExecutorPhotoCheck.id == check_id).first()
    if not row:
        raise HTTPException(404, "Проверка не найдена")

    status = (data.get("status") or "").strip()
    if status not in ("approved", "rejected"):
        raise HTTPException(400, "Статус должен быть approved или rejected")

    comment = (data.get("comment") or "").strip() or None
    row.status = status
    row.decision_comment = comment
    row.decided_at = datetime.utcnow()
    db.commit()
    db.refresh(row)

    executor = db.query(Executor).filter(Executor.id == row.executor_id).first()
    if executor:
        text = (
            "Фото принято — проверка пройдена."
            if status == "approved"
            else f"Фото отклонено{(f': {comment}' if comment else '')}. Пришлите новое фото."
        )
        db.add(Notification(
            user_max_id=str(executor.max_id),
            title="Фото-контроль: принято" if status == "approved" else "Фото-контроль: отклонено",
            body=text,
        ))
        db.commit()
        try:
            send_max_message(executor.max_id, text, bot="executor")
        except Exception:
            pass

    return _photo_check_json(row)


@router.post("/executors/{executor_id}/roles")
def add_role(
    executor_id: int,
    data: RoleIn,
    executor: Executor = Depends(get_current_executor),
    db: Session = Depends(get_db),
):
    if data.role not in ROLES:
        raise HTTPException(400, "Неизвестная роль")
    _require_same(executor, executor_id)

    if data.role not in executor_roles(db, executor_id):
        db.add(ExecutorRole(executor_id=executor_id, role=data.role))
        db.commit()
    return executor_profile(db, executor)

@router.put("/executors/{executor_id}/active-role")
def set_active_role(
    executor_id: int,
    data: RoleIn,
    executor: Executor = Depends(get_current_executor),
    db: Session = Depends(get_db),
):
    _require_same(executor, executor_id)
    executor = get_executor(db, executor_id)
    roles = executor_roles(db, executor_id)
    if data.role not in roles:
        raise HTTPException(400, "Эта роль не добавлена исполнителю")
    if has_active_order(db, executor_id):
        active = has_active_order(db, executor_id)
        if getattr(active, "executor_role", None) and active.executor_role != data.role:
            raise HTTPException(409, "Нельзя сменить роль во время активного заказа")
    executor.active_role = data.role
    db.commit()
    return executor_profile(db, executor)

@router.get("/executors/{executor_id}/can-accept")
def can_accept(
    executor_id: int,
    role: str,
    executor: Executor = Depends(get_current_executor),
    db: Session = Depends(get_db),
):
    _require_same(executor, executor_id)
    executor = get_executor(db, executor_id)
    if role not in executor_roles(db, executor_id):
        return {"allowed": False, "reason": "Роль не добавлена"}
    active = has_active_order(db, executor_id)
    if active:
        active_role = getattr(active, "executor_role", None) or executor.active_role
        if active_role != role:
            return {"allowed": False, "reason": "У вас активный заказ в другой роли"}
    return {"allowed": True, "reason": ""}


# У заказа роль хранится косвенно — через service; приводим к ролям исполнителя
SERVICE_ROLE = {
    "taxi": "driver",
    "courier": "courier",
    "cargo": "cargo",
    "master": "master",
    "car_rental": "car_owner",
    "car": "car_owner",
    "flat_rental": "flat_owner",
    "flat": "flat_owner",
}


def _service_to_role(service: str | None) -> str:
    return SERVICE_ROLE.get((service or "").strip().lower(), service or "driver")


@router.get("/executors/{executor_id}/earnings")
def earnings(
    executor_id: int,
    days: int = 7,
    executor: Executor = Depends(get_current_executor),
    db: Session = Depends(get_db),
):
    """Вновь заработанное по ролям — для подсказки в переключателе ролей."""
    _require_same(executor, executor_id)
    days = max(1, min(days, 90))
    since = datetime.utcnow() - timedelta(days=days)

    orders = db.query(Order).filter(
        Order.driver_id == executor_id,
        Order.status == "completed",
        Order.created_at >= since,
    ).all()

    by_role = {}
    total = 0.0

    for o in orders:
        net = (o.total_price or 0) - (o.commission_amount or 0)
        role = _service_to_role(o.service)
        by_role[role] = by_role.get(role, 0) + net
        total += net

    return {
        "days": days,
        "orders_count": len(orders),
        "total": round(total, 2),
        "by_role": {r: round(v, 2) for r, v in by_role.items()},
    }

class StatusIn(BaseModel):
    status: str

# Смена статуса верификации — только для администратора.
# Раньше здесь был и открытый GET /admin/executors (без авторизации и
# в неверном формате) — он затенял админ-роут из main.py; удалён.
@router.put("/admin/executors/{executor_id}/status")
def set_status(executor_id: int, data: StatusIn, admin=Depends(get_admin), db: Session = Depends(get_db)):
    if data.status not in ["pending", "approved", "rejected"]:
        raise HTTPException(400, "Недопустимый статус")
    executor = get_executor(db, executor_id)
    executor.status = data.status
    db.commit()
    return {"id": executor.id, "status": executor.status}
