import os
import hashlib
from fastapi import Cookie, Response
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.config import settings
from app.db import get_db
from app import models, pricing, worktime, rating
from app.security import create_token, hash_password, verify_password, get_current_user
from pydantic import BaseModel
app=FastAPI(title="Pro API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
import csv
import io
import secrets
from fastapi.responses import StreamingResponse

@app.get("/api/health")
def health(): return {"status":"ok"}

# --- статистика востребованности услуг (для главной страницы миниаппа) ---
from datetime import timedelta as _timedelta
from sqlalchemy import func as _sql_func


@app.get("/api/stats/popular-services")
def popular_services(days: int = 90, db: Session = Depends(get_db)):
    """Агрегированные счётчики заказов по услугам.

    Нужны главной странице, чтобы выводить на первый план ту услугу,
    которой пользуются чаще всего. Публичный агрегат: без телефонов,
    имён и любых других персональных данных.
    """
    days = max(1, min(days, 365))
    since = datetime.utcnow() - _timedelta(days=days)

    rows = (
        db.query(models.Order.service, _sql_func.count(models.Order.id))
        .filter(
            models.Order.created_at >= since,
            models.Order.status != "cancelled",
        )
        .group_by(models.Order.service)
        .all()
    )

    counts = {str(service or "taxi"): int(total) for service, total in rows}
    total = sum(counts.values())
    top = max(counts, key=counts.get) if counts else "taxi"

    return {
        "window_days": days,
        "total": total,
        "top": top,
        "counts": counts,
    }

# --- auth ---
class AuthIn(BaseModel):
    max_user_id: str; phone: str; role: str = "client"
@app.post("/api/auth/max")
def auth_max(data: AuthIn, db: Session=Depends(get_db)):
    user=db.query(models.User).filter_by(max_user_id=data.max_user_id).first()
    if not user:
        user=models.User(max_user_id=data.max_user_id, phone=data.phone, role=data.role)
        db.add(user); db.commit(); db.refresh(user)
    return {"token":create_token(user.id,user.role),"user":{"id":user.id,"role":user.role,"status":user.status}}


# PRO_MAX_AUTH_PATCH
import hmac
import json
import time
from urllib.parse import parse_qsl


# PRO_CONTACT_RAW_SERVER
# PRO_CONTACT_OBJECT_AUTH
class MaxMiniAppAuthIn(BaseModel):
    init_data: str
    contact: dict


# PRO_MAX_AUTH_FIX_1
def _max_bot_token() -> str:
    # Клиентский mini-app открыт ботом клиента,
    # поэтому подпись проверяется его токеном.
    token = settings.max_client_bot_token.strip()
    if not token or token == "your_max_bot_token":
        raise HTTPException(
            status_code=503,
            detail="Авторизация MAX временно недоступна",
        )
    return token


def _validate_max_init_data(init_data: str) -> dict:
    bot_token = _max_bot_token()
    pairs = parse_qsl(init_data, keep_blank_values=True)

    values = {}
    for key, value in pairs:
        if key in values:
            raise HTTPException(401, "Некорректные данные MAX")
        values[key] = value

    if values.get("hash") is None:
        raise HTTPException(401, "Не передана подпись MAX")

    received_hash = values.pop("hash")

    try:
        auth_date = int(values.get("auth_date", "0"))
    except ValueError:
        raise HTTPException(401, "Некорректная дата авторизации MAX")

    if auth_date <= 0 or time.time() - auth_date > 3600:
        raise HTTPException(401, "Данные авторизации MAX устарели")

    launch_params = "\n".join(
        f"{key}={value}"
        for key, value in sorted(values.items())
    )

    inner_key = hmac.new(
        b"WebAppData", bot_token.encode(), hashlib.sha256
    ).digest()
    expected = hmac.new(
        inner_key, launch_params.encode(), hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(expected, received_hash):
        raise HTTPException(401, "Не пройдена проверка подписи MAX")

    try:
        user = json.loads(values["user"])
    except Exception:
        raise HTTPException(401, "Не удалось прочитать пользователя MAX")

    max_user_id = user.get("id")
    if not max_user_id:
        raise HTTPException(401, "В данных MAX нет пользователя")

    return {"max_user_id": str(max_user_id), "user": user}


# PRO_CONTACT_OBJECT_AUTH
def _validate_max_contact(
    contact: dict, max_user_id: str
) -> str:
    bot_token = _max_bot_token()

    auth_date = str(contact.get("authDate") or "")
    phone = str(contact.get("phone", "")).strip()
    received_hash = str(contact.get("hash", "")).lower()

    if not all([auth_date, phone, received_hash]):
        raise HTTPException(401, "Не подтверждён номер телефона")

    normalized_phone = phone[1:] if phone.startswith("+") else phone
    inner_key = hmac.new(
        b"WebAppData", bot_token.encode(), hashlib.sha256
    ).digest()

    messages = {
        "concat:auth+phone": auth_date + phone,
        "concat:auth+phone_norm": auth_date + normalized_phone,
        "concat:auth+phone+uid": auth_date + phone + max_user_id,
        "concat:auth+phone_norm+uid": (
            auth_date + normalized_phone + max_user_id
        ),
        "kv:authDate-phone": f"authDate={auth_date}\nphone={phone}",
        "kv:authDate-phone-norm": (
            f"authDate={auth_date}\nphone={normalized_phone}"
        ),
        "kv:authDate-phone-uid": (
            f"authDate={auth_date}\nphone={phone}\nuserId={max_user_id}"
        ),
        "kv:authDate-phone-norm-uid": (
            f"authDate={auth_date}\nphone={normalized_phone}"
            f"\nuserId={max_user_id}"
        ),
    }

    keys = {
        "token": bot_token.encode(),
        "secret": inner_key,
    }

    matched = None

    for message_label, message in messages.items():
        for key_label, key in keys.items():
            expected = hmac.new(
                key, message.encode(), hashlib.sha256
            ).hexdigest()
            if hmac.compare_digest(expected, received_hash):
                matched = f"hmac:{key_label}:{message_label}"
                break
        if matched:
            break

    if not matched:
        for message_label, message in messages.items():
            for key_label, key in keys.items():
                for order in ("suffix", "prefix"):
                    raw = (
                        message.encode() + key
                        if order == "suffix"
                        else key + message.encode()
                    )
                    expected = hashlib.sha256(raw).hexdigest()
                    if hmac.compare_digest(expected, received_hash):
                        matched = (
                            f"sha256:{key_label}:{order}:"
                            f"{message_label}"
                        )
                        break
                if matched:
                    break
            if matched:
                break

    print(
        "CONTACT_HASH_DIAG "
        f"auth_date={auth_date} "
        f"phone_len={len(phone)} "
        f"hash_len={len(received_hash)} "
        f"matched={matched or 'none'}",
        flush=True,
    )

    if not matched:
        raise HTTPException(401, "Не пройдена проверка номера телефона")

    return phone


@app.post("/api/auth/max/miniapp")
def auth_max_miniapp(
    data: MaxMiniAppAuthIn,
    db: Session = Depends(get_db),
):
    identity = _validate_max_init_data(data.init_data)
    phone = _validate_max_contact(
        data.contact, identity["max_user_id"]
    )

    user = db.query(models.User).filter_by(
        max_user_id=identity["max_user_id"]
    ).first()

    if not user:
        user = models.User(
            max_user_id=identity["max_user_id"],
            phone=phone,
            role="client",
        )
        db.add(user)
    else:
        user.phone = phone

    db.commit()
    db.refresh(user)

    client = db.query(models.Client).filter_by(max_id=user.max_user_id).first()
    if not client:
        client = models.Client(
            max_id=user.max_user_id,
            name=user.phone or "Клиент",
            phone=user.phone,
            balance=0,
        )
        db.add(client)
        db.commit()
    elif not client.phone:
        # Старая запись без номера: summary.phone пустел, миниапп снова и снова
        # спрашивал контакт и перезапускался — дописываем номер сейчас же
        client.phone = user.phone
        if not client.name:
            client.name = user.phone
        db.commit()

    return {
        "token": create_token(user.id, user.role),
        "user": {
            "id": user.id,
            "role": user.role,
            "status": user.status,
        },
    }


# --- tariffs ---
@app.get("/api/tariffs")
def tariffs(db: Session=Depends(get_db)):
    return db.query(models.Tariff).filter_by(active=True).all()

class PriceIn(BaseModel):
    tariff_code:str; distance_km:float; city_km:float=0; out_km:float=0
    children:int=0; animals:bool=False; child_seats:int=0; manual_increase:float=0
@app.post("/api/price")
def price(data: PriceIn, db: Session=Depends(get_db)):
    t=db.query(models.Tariff).filter_by(code=data.tariff_code,active=True).first()
    if not t: raise HTTPException(404,"tariff not found")
    if data.tariff_code=="standard":
        total=pricing.calc_standard(data.distance_km,data.city_km,data.out_km,t,data.children,data.animals,data.child_seats,data.manual_increase)
    else:
        total=pricing.calc_intercity(data.distance_km,t,data.children,data.animals,data.child_seats,data.manual_increase)
    return {"total":total,"commission_percent":float(db.query(models.Setting).get("commission_percent").value if db.query(models.Setting).get("commission_percent") else 15)}

# --- orders ---
# Соответствие сервиса заказа роли исполнителя, назначаемой на него
SERVICE_ROLE = {
    "taxi": "driver",
    "courier": "courier",
    "cargo": "cargo",
    "master": "master",
    "tech_help": "driver",
}
# Тариф грузоперевозок: считаем на бэкенде, цену клиента не принимаем
CARGO_BASE_PRICE = 700.0
CARGO_KM_PRICE = 35.0
CARGO_LOADER_HOUR_PRICE = 500.0
CARGO_LOADERS_MAX = 4
CARGO_LOADER_HOURS_MAX = 12

# Автотехпомощь: услуги и цены (цену считает сервер).
# tow (эвакуация) — по тарифу грузоперевозок, sober_driver — 3× тариф такси.
TECH_HELP_SERVICES = {
    "jump_start":   {"title": "Прикурить авто",   "price": 500},
    "tire_inflate": {"title": "Подкачать колесо", "price": 250},
    "diagnostics":  {"title": "Диагностика",      "price": 1000},
    "tow":          {"title": "Эвакуация",        "price": None},   # 700 + 35/км
    "sober_driver": {"title": "Трезвый водитель", "price": None},   # max(1000, 3×такси)
}


class OrderIn(BaseModel):
    client_id:int; tariff_code:str="standard"; service:str="taxi"; from_address:str; to_address:str
    from_lat:float|None=None; from_lon:float|None=None; to_lat:float|None=None; to_lon:float|None=None
    distance_km:float; city_km:float=0; out_km:float=0
    children:int=0; animals:bool=False; child_seats:int=0
    manual_increase:float=0; scheduled_at:datetime|None=None
    wheelchair: bool = False
    own_child_seat: bool = False
    comment: str | None = None
    meta: dict | None = None
def _client_from_token(db: Session, user: dict):
    """Реальный клиент из токена (не наказываем чужим client_id из тела запроса)."""
    max_id = _token_max_id(db, user) if user else None
    if not max_id:
        return None
    client = db.query(models.Client).filter_by(max_id=max_id).first()
    if not client:
        client = models.Client(max_id=max_id, name="Клиент", balance=0)
        db.add(client)
        db.flush()
    return client


@app.post("/api/orders")
def create_order(data: OrderIn, db: Session=Depends(get_db), user=Depends(get_current_user)):
    return _create_order_internal(db, data, _client_from_token(db, user))


def _create_order_internal(db: Session, data: OrderIn, client):
    """Расчёт цены и создание заказа — общий путь для клиента и оператора."""
    service = (data.service or "taxi").strip().lower()
    if service not in ("taxi", "cargo", "tech_help"):
        raise HTTPException(400, "Сервис недоступен")
    client = _client_from_token(db, user)
    cp=float(db.query(models.Setting).get("commission_percent").value) if db.query(models.Setting).get("commission_percent") else 15

    if service == "cargo":
        # Цена грузоперевозки считается сервером: 700 + 35/км + грузчики×часы×500
        meta_in = data.meta or {}
        loaders = max(0, min(int(meta_in.get("loaders") or 0), CARGO_LOADERS_MAX))
        loader_hours = max(0, min(int(meta_in.get("loader_hours") or 0), CARGO_LOADER_HOURS_MAX))
        base = CARGO_BASE_PRICE + float(data.distance_km or 0) * CARGO_KM_PRICE + loaders * loader_hours * CARGO_LOADER_HOUR_PRICE
        total = round(base, 2)
        tariff_code = "cargo"
        meta = {"loaders": loaders, "loader_hours": loader_hours}
    elif service == "tech_help":
        # Автотехпомощь: цена считается сервером по выбранной услуге
        meta_in = data.meta or {}
        key = (meta_in.get("service_key") or "").strip()
        svc = TECH_HELP_SERVICES.get(key)
        if not svc:
            raise HTTPException(400, "Услуга автотехпомощи не выбрана")
        dist = float(data.distance_km or 0)
        if key == "sober_driver":
            # Трезвый водитель: A→B по тройному тарифу такси, но не меньше 1000 ₽
            std = db.query(models.Tariff).filter_by(code="standard", active=True).first()
            if std:
                taxi_price = pricing.calc_standard(dist, dist, 0, std, 0, 0, 0, 0)
            else:
                taxi_price = dist * 25.0
            base = max(1000.0, round(taxi_price * 3))
        elif key == "tow":
            # Эвакуация — по тарифу грузоперевозок (без грузчиков), только предзаказ
            if not data.scheduled_at:
                raise HTTPException(400, "Эвакуация доступна только как предзаказ — укажите дату и время")
            base = CARGO_BASE_PRICE + dist * CARGO_KM_PRICE
        else:
            base = float(svc["price"])
        total = round(base)
        tariff_code = "tech_help"
        meta = {"service_key": key, "service_title": svc["title"]}
        if (data.comment or "").strip():
            meta["comment"] = data.comment.strip()[:500]
    else:
        t=db.query(models.Tariff).filter_by(code=data.tariff_code,active=True).first()
        if not t: raise HTTPException(400,"tariff unavailable")
        if data.tariff_code=="intercity":
            pass  # проверка населённого пункта выполняется через /settlements/check
        if data.tariff_code=="standard":
            base=pricing.calc_standard(data.distance_km,data.city_km,data.out_km,t,data.children,data.animals,data.child_seats,0)
        else:
            base=pricing.calc_intercity(data.distance_km,t,data.children,data.animals,data.child_seats,0)
        # Надбавка клиента ограничена 50% от расчётной цены — защита от «фейковых» заказов
        max_increase=round(base*0.5,2)
        manual_increase=min(max(0.0,float(data.manual_increase or 0)),max_increase)
        if data.tariff_code=="standard":
            total=pricing.calc_standard(data.distance_km,data.city_km,data.out_km,t,data.children,data.animals,data.child_seats,manual_increase)
        else:
            total=pricing.calc_intercity(data.distance_km,t,data.children,data.animals,data.child_seats,manual_increase)
        tariff_code = data.tariff_code
        meta={"wheelchair": data.wheelchair, "own_child_seat": data.own_child_seat}
        if (data.comment or "").strip():
            meta["comment"]=data.comment.strip()[:500]

    o=models.Order(client_id=client.id if client else data.client_id,service=service,tariff_code=tariff_code,from_address=data.from_address,to_address=data.to_address,
        from_lat=data.from_lat,from_lon=data.from_lon,to_lat=data.to_lat,to_lon=data.to_lon,distance_km=data.distance_km,
        city_distance_km=data.city_km,out_city_distance_km=data.out_km,base_price=base,options_price=0,
        manual_increase=manual_increase if service not in ("cargo", "tech_help") else 0,total_price=total,commission_percent=cp,
        commission_amount=pricing.commission(total,cp),children=data.children,animals=data.animals,child_seats=data.child_seats,
        scheduled_at=data.scheduled_at,status="created",meta=meta)
    db.add(o)
    o.share_code = secrets.token_hex(4)
    db.commit(); db.refresh(o)
    db.add(models.OrderEvent(order_id=o.id,event="created",payload={"total":total})); db.commit()
    db.refresh(o)
    return o


@app.post("/api/admin/orders", status_code=201)
def admin_create_order(
    data: OrderIn,
    staff=Depends(get_staff),
    db: Session=Depends(get_db),
):
    """Оператор/админ создаёт заказ за клиента (диспетчерская)."""
    client = db.query(models.Client).filter(
        models.Client.id == int(data.client_id or 0)
    ).first()
    if not client:
        raise HTTPException(404, "Клиент не найден")

    o = _create_order_internal(db, data, client)

    db.add(models.Notification(
        user_max_id=str(client.max_id),
        title="Заказ создан оператором",
        body=f"Оператор оформил для вас заказ №{o.id}: "
             f"{o.from_address} → {o.to_address or '—'}.",
    ))
    db.commit()
    return o

@app.get("/api/me/orders")
def my_orders(user=Depends(get_current_user), db: Session=Depends(get_db)):
    """Заказы клиента: чтобы список и текущий заказ переживали перезапуск миниаппа."""
    max_id = _token_max_id(db, user)
    client = db.query(models.Client).filter(models.Client.max_id == max_id).first()
    if not client:
        return {"orders": [], "active_order_id": None}

    rows = db.query(models.Order).filter(
        models.Order.client_id == client.id
    ).order_by(models.Order.id.desc()).limit(100).all()

    active = next(
        (o for o in rows if o.status in ("created", "assigned", "accepted", "in_progress")),
        None,
    )

    return {
        "orders": [{
            "id": o.id,
            "status": o.status,
            "service": o.service,
            "tariff_code": o.tariff_code,
            "from_address": o.from_address,
            "to_address": o.to_address,
            "total_price": o.total_price,
            "manual_increase": o.manual_increase,
            "comment": (o.meta or {}).get("comment") if o.meta else None,
            "favorite": bool(o.favorite),
            "favorite_title": o.favorite_title,
            "share_code": o.share_code,
            "created_at": o.created_at.isoformat() if o.created_at else None,
        } for o in rows],
        "active_order_id": active.id if active else None,
    }


@app.post("/api/orders/{order_id}/favorite")
def set_favorite(
    order_id: int,
    data: dict,
    user=Depends(get_current_user),
    db: Session=Depends(get_db),
):
    """Отметить заказ избранным или убрать отметку."""
    order = _client_order(db, order_id, user)
    order.favorite = bool(data.get("favorite", True))
    db.commit()
    return {"ok": True, "id": order.id, "favorite": bool(order.favorite)}


@app.put("/api/orders/{order_id}/favorite-title")
def set_favorite_title(
    order_id: int,
    data: dict,
    user=Depends(get_current_user),
    db: Session=Depends(get_db),
):
    """Своё название избранного заказа."""
    order = _client_order(db, order_id, user)
    title = (data.get("title") or "").strip()
    order.favorite_title = title[:120] or None
    db.commit()
    return {"ok": True, "id": order.id, "favorite_title": order.favorite_title}


@app.get("/api/me/support")
def me_support(user=Depends(get_current_user), db: Session=Depends(get_db)):
    """Чат клиента с поддержкой (оператором) — как у исполнителя."""
    max_id = _token_max_id(db, user)
    client = db.query(models.Client).filter(models.Client.max_id == max_id).first()
    if not client:
        return {"messages": [], "unread": 0}

    rows = (
        db.query(models.OperatorMessage)
        .filter(models.OperatorMessage.client_id == client.id)
        .order_by(models.OperatorMessage.id.asc())
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
        "unread": sum(
            1 for row in rows if row.author_role != "client" and not row.is_read
        ),
    }


@app.post("/api/me/support")
def me_support_send(
    data: dict,
    user=Depends(get_current_user),
    db: Session=Depends(get_db),
):
    """Клиент пишет в поддержку — сообщение уходит в ленту оператора."""
    text = (data.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "Пустое сообщение")
    max_id = _token_max_id(db, user)
    client = db.query(models.Client).filter(models.Client.max_id == max_id).first()
    if not client:
        raise HTTPException(403, "Клиент не найден")

    row = models.OperatorMessage(
        client_id=client.id, author_role="client", text=text[:2000]
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


def _client_order(db: Session, order_id: int, user: dict):
    max_id = _token_max_id(db, user)
    client = db.query(models.Client).filter(models.Client.max_id == max_id).first()
    if not client:
        raise HTTPException(403, "Клиент не найден")
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Заказ не найден")
    if order.client_id != client.id:
        raise HTTPException(403, "Это не ваш заказ")
    return order


def _completed_at(db, order):
    """Момент завершения заказа — из события completed.

    По нему живут часовые окна: оценка поездки и чат/«Оставили вещи»
    после завершения.
    """
    event = db.query(models.OrderEvent).filter(
        models.OrderEvent.order_id == order.id,
        models.OrderEvent.event == "completed",
    ).order_by(models.OrderEvent.id.desc()).first()
    return event.created_at if event else None


@app.get("/api/orders/{order_id}")
def get_order(order_id:int, db: Session=Depends(get_db)):
    o=db.query(models.Order).get(order_id)
    if not o: raise HTTPException(404)
    payload = {c.name: getattr(o, c.name) for c in o.__table__.columns}
    done = _completed_at(db, o)
    payload["completed_at"] = done.isoformat() if done else None
    payload["lost_item"] = db.query(models.OrderEvent).filter(
        models.OrderEvent.order_id == o.id,
        models.OrderEvent.event == "lost_item",
    ).first() is not None
    return payload


@app.get("/api/orders/{order_id}/share/{share_code}")
def order_share(order_id: int, share_code: str, db: Session = Depends(get_db)):
    """Публичная сводка по ссылке из «Поделиться» — без цен и персональных данных."""
    o = db.query(models.Order).filter(
        models.Order.id == order_id,
        models.Order.share_code == share_code,
    ).first()
    if not o:
        raise HTTPException(404, "Ссылка недействительна")

    return {
        "order_id": o.id,
        "status": o.status,
        "service": o.service,
        "from_address": o.from_address,
        "to_address": o.to_address,
        "planned_completion_at": (
            o.planned_completion_at.isoformat()
            if o.planned_completion_at else None
        ),
        "created_at": o.created_at.isoformat() if o.created_at else None,
    }

@app.post("/api/orders/{order_id}/waiting")
def waiting(order_id:int, minutes:int, db: Session=Depends(get_db)):
    o=db.query(models.Order).get(order_id)
    if not o: raise HTTPException(404)
    o.waiting_price=pricing.calc_waiting(minutes)
    o.total_price=o.base_price+o.options_price+o.waiting_price+o.manual_increase
    o.commission_amount=pricing.commission(o.total_price,o.commission_percent)
    db.commit(); return o

@app.post("/api/orders/{order_id}/increase")
def increase(order_id:int, db: Session=Depends(get_db)):
    o=db.query(models.Order).get(order_id)
    if not o: raise HTTPException(404)
    o.manual_increase+=50; o.total_price+=50
    o.commission_amount=pricing.commission(o.total_price,o.commission_percent)
    db.commit(); return o

@app.get("/api/available-orders")
@app.get("/api/orders/available")
def available_orders(executor_id: int, role: str, db: Session = Depends(get_db)):
    service_by_role = {
        "driver": "taxi",
        "taxi": "taxi",
        "courier": "courier",
        "cargo": "cargo",
        "master": "master"
    }

    service = service_by_role.get(role)
    if not service:
        return []

    executor = db.query(models.Executor).get(executor_id)
    if not executor or executor.status != "approved":
        return []

    # Контроль рабочего времени: при лимите или недосыпе новые заказы не поступают
    work = worktime.work_state(db, executor_id)
    if not work.get("can_accept_orders", True):
        return []

    roles = [r.role for r in db.query(models.ExecutorRole).filter_by(executor_id=executor_id).all()]
    if role not in roles:
        return []

    orders = db.query(models.Order).filter(
        models.Order.status == "created",
        models.Order.service == service
    ).order_by(models.Order.scheduled_at.asc().nullslast(), models.Order.id.asc()).all()

    result = []
    for o in orders:
        # Анти-самозаказы: свои заказы не показываем в пуле
        if self_order_blocked(db, o, executor):
            continue
        meta = dict(o.meta or {})
        if (o.service or "") == "master":
            ms_id = meta.get("master_service_id")
            if ms_id:
                ms = db.query(models.MasterService).get(ms_id)
                if ms:
                    meta.setdefault("master_title", ms.title)
        result.append({
            "id": o.id,
            "service": o.service,
            "tariff_code": o.tariff_code,
            "from_address": o.from_address,
            "to_address": o.to_address,
            "distance_km": o.distance_km,
            "total_price": o.total_price,
            "scheduled_at": o.scheduled_at,
            "created_at": o.created_at,
            "meta": meta,
        })
    return result

@app.post("/api/orders/{order_id}/assign/{executor_id}")
def assign(order_id:int, executor_id:int, db: Session=Depends(get_db)):
    o = db.query(models.Order).get(order_id)
    if not o:
        raise HTTPException(404, "Заказ не найден")

    if o.status not in ("created", "chain_reserved"):
        raise HTTPException(409, "Заказ недоступен для принятия")

    executor = db.query(models.Executor).get(executor_id)
    if not executor:
        raise HTTPException(404, "Исполнитель не найден")

    if executor.status != "approved":
        raise HTTPException(403, "Исполнитель не прошёл верификацию")

    # Временное отстранение: низкий рейтинг или решение администратора
    susp = rating.active_suspension(db, executor_id)
    if susp:
        raise HTTPException(403, rating.suspension_notice(susp))

    # Анти-самозаказы: заказ на тот же номер телефона, что у исполнителя — нельзя
    so = self_order_blocked(db, o, executor)
    if so:
        raise HTTPException(403, so)

    # Контроль рабочего времени: нельзя принять заказ при лимите 12 ч или во время отдыха
    work = worktime.work_state(db, executor_id)
    if work.get("status") == worktime.STATUS_BLOCKED:
        raise HTTPException(409, "Исчерпан лимит рабочего времени — новые заказы не поступают")
    if work.get("status") == worktime.STATUS_RESTING:
        raise HTTPException(409, "После смены нужен отдых 6 часов — вернёмся к заказам позже")
    worktime.start_session(db, executor_id)
    # Успешный приём сбрасывает счётчик пропусков
    executor.skip_streak = 0

    roles = [r.role for r in db.query(models.ExecutorRole).filter_by(executor_id=executor_id).all()]
    # Роль выводится из сервиса заказа: грузовой заказ не должен требовать роль таксиста
    required_role = SERVICE_ROLE.get(o.service or "taxi", "driver")

    if required_role not in roles:
        raise HTTPException(403, "У исполнителя нет роли для этого заказа")

    active = db.query(models.Order).filter(
        models.Order.executor_id == executor_id,
        models.Order.status.in_(["assigned", "accepted", "in_progress"])
    ).first()

    is_reserved_chain = (
        o.status == "chain_reserved"
        and o.chain_reserved_order_id == active.id if active else False
    )

    if active and not is_reserved_chain:
        raise HTTPException(409, "У исполнителя уже есть активный заказ")

    if is_reserved_chain:
        current = db.query(models.Order).get(active.id)
        current_intercity = "intercity" in (current.tariff_code or "").lower()
        reverse = (
            current.from_address == o.to_address
            and current.to_address == o.from_address
        )
        if current_intercity and not reverse:
            raise HTTPException(400, "Для межгорода доступен только встречный заказ")

    o.executor_id = executor_id
    o.executor_role = required_role
    o.status = "assigned"
    o.planned_completion_at = estimate_completion(o)

    db.add(models.OrderEvent(order_id=o.id, event="assigned"))

    db.add(models.Notification(
        user_max_id=executor.max_id,
        title="Заказ назначен",
        body=f"Заказ №{o.id}: {o.from_address} → {o.to_address}, {o.total_price} ₽",
        order_id=o.id,
        category="order"
    ))

    if o.client_id:
        client = db.query(models.Client).get(o.client_id)
        if client:
            db.add(models.Notification(
                user_max_id=client.max_id,
                title="Исполнитель назначен",
                body=f"Ваш заказ №{o.id} принят. Исполнитель: {executor.name or 'Исполнитель'}",
                order_id=o.id,
                category="order"
            ))

    db.commit()

    send_max_message(
        executor.max_id,
        f"Новый заказ №{o.id}: {o.from_address} → {o.to_address}, {o.total_price} ₽. Откройте миниап исполнителя.",
        bot="executor"
    )

    if o.client_id:
        client = db.query(models.Client).get(o.client_id)
        if client:
            send_max_message(
                client.max_id,
                f"Ваш заказ №{o.id} принят. Исполнитель: {executor.name or 'Исполнитель'}.",
                bot="client"
            )

    return o

@app.post("/api/orders/{order_id}/activate-chain/{executor_id}")
def activate_chain(order_id:int, executor_id:int, db: Session=Depends(get_db)):
    completed = db.query(models.Order).get(order_id)
    if not completed or completed.executor_id != executor_id:
        raise HTTPException(404, "Завершённый заказ не найден")

    reserved = db.query(models.Order).filter(
        models.Order.chain_reserved_order_id == order_id,
        models.Order.executor_id == executor_id,
        models.Order.status == "chain_reserved"
    ).first()

    if not reserved:
        return {"activated": False}

    reserved.status = "assigned"
    reserved.planned_completion_at = estimate_completion(reserved)
    db.add(models.OrderEvent(order_id=reserved.id, event="chain_activated"))
    db.commit()
    return {"activated": True, "order_id": reserved.id}

@app.post("/api/orders/{order_id}/complete")
def complete(order_id:int, db: Session=Depends(get_db)):
    o=db.query(models.Order).get(order_id)
    if not o or not o.executor_id: raise HTTPException(400)
    if o.status == "completed":
        raise HTTPException(409, "Заказ уже завершён")
    if o.status not in ("assigned","accepted","in_progress"):
        raise HTTPException(400, "Заказ ещё не выполняется")
    o.status="completed"
    executor=db.query(models.Executor).get(o.executor_id)
    payout=round((o.total_price or 0)-(o.commission_amount or 0),2)
    if executor:
        executor.balance=(executor.balance or 0)+payout
        db.add(models.ExecutorBalanceOp(
            executor_id=executor.id,
            type="earning",
            amount=payout,
            order_id=o.id,
            comment=f"Заказ №{o.id}",
        ))
        worktime.touch_session(db, executor.id)
    db.add(models.OrderEvent(order_id=o.id,event="completed",payload={"payout":payout,"commission":o.commission_amount})); db.commit(); db.refresh(o)

    if o.client_id:
        client=db.query(models.Client).get(o.client_id)
        if client:
            send_max_message(
                client.max_id,
                f"Заказ №{o.id} завершён. Спасибо, что выбрали «Про»!",
                bot="client",
            )
    return o

# --- settlements ---
@app.get("/api/settlements/intercity")
def intercity_settlements(db: Session=Depends(get_db)):
    return db.query(models.Settlement).filter_by(intercity_allowed=True).all()

# --- ratings ---
class RatingIn(BaseModel):
    order_id:int
    value:str
    comment:str|None=None
    # путь исполнителя: у миниаппа исполнителя нет JWT-токена пользователя,
    # он подтверждает авторство executor_id (+ сверка с заказом)
    executor_id:int|None=None


def _optional_user(auth_header: str):
    """Пользователь из Bearer-токена, если он валиден; иначе None."""
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    from jose import jwt as _jwt, JWTError as _JWTError
    try:
        payload = _jwt.decode(
            auth_header[7:], settings.jwt_secret, algorithms=["HS256"]
        )
    except Exception:
        return None
    return {"id": payload.get("sub"), "role": payload.get("role")}


@app.post("/api/ratings")
def rate(
    data: RatingIn,
    request: Request,
    db: Session = Depends(get_db),
):
    if data.value not in ("like","dislike"): raise HTTPException(400)

    o = db.query(models.Order).get(data.order_id)
    if not o:
        raise HTTPException(404, "Заказ не найден")
    if o.status != "completed":
        raise HTTPException(400, "Оценить можно только завершённый заказ")

    # Окно оценки: сразу после завершения и в течение часа после него
    done_at = _completed_at(db, o)
    if done_at and datetime.utcnow() - done_at > timedelta(hours=1):
        raise HTTPException(403, "Оценить заказ можно только в течение часа после завершения")

    author_id = None
    kind = None          # client | executor
    target_id = None
    target_executor = None

    user = _optional_user(request.headers.get("Authorization", ""))

    if user:
        max_id = _token_max_id(db, user)
        client = db.query(models.Client).filter_by(max_id=max_id).first()
        if not client or o.client_id != client.id:
            raise HTTPException(403, "Этот заказ вам не принадлежит")
        author_id = client.id
        kind = "client"
        if o.executor_id:
            target_executor = db.query(models.Executor).get(o.executor_id)
            target_id = target_executor.id if target_executor else None
    else:
        if not data.executor_id:
            raise HTTPException(401, "Требуется авторизация")
        ex = db.query(models.Executor).get(data.executor_id)
        if not ex or o.executor_id != ex.id:
            raise HTTPException(403, "Заказ принадлежит другому исполнителю")
        author_id = ex.id
        kind = "executor"
        target_id = o.client_id

    if target_id is None:
        raise HTTPException(409, "В этом заказе некого оценивать")

    existing = db.query(models.Rating).filter_by(
        order_id=o.id, author_id=author_id
    ).first()
    if existing:
        # Негатив в течение часа можно передумать и поставить лайк;
        # положительную оценку изменить нельзя.
        if not (existing.value == "dislike" and data.value == "like"):
            raise HTTPException(
                409,
                "Положительную оценку изменить нельзя"
                if existing.value == "like"
                else "Оценка уже оставлена",
            )
        existing.value = "like"
        existing.comment = data.comment
        quality = None
        if kind == "client" and target_executor:
            target_executor.rating_likes = (target_executor.rating_likes or 0) + 1
            target_executor.rating_dislikes = max(0, (target_executor.rating_dislikes or 0) - 1)
            quality = rating.update_executor_rating(db, target_executor)
        elif kind == "executor":
            rated_client = db.query(models.Client).get(target_id)
            if rated_client:
                quality = rating.update_client_rating(db, rated_client)
        db.commit()
        result = {"ok": True, "by": kind, "target_id": target_id, "changed": True}
        if quality:
            result["rating"] = {"percent": quality["percent"]}
        return result

    db.add(models.Rating(
        order_id=o.id,
        author_id=author_id,
        target_id=target_id,
        value=data.value,
        comment=data.comment,
    ))

    quality = None
    if kind == "client" and target_executor:
        counter = "rating_likes" if data.value == "like" else "rating_dislikes"
        setattr(
            target_executor,
            counter,
            (getattr(target_executor, counter) or 0) + 1,
        )
        # Рейтинг «батареей»: пересчёт процента, уведомления о качестве
        # и, при падении ниже 50%, временное отстранение от заказов
        quality = rating.update_executor_rating(db, target_executor)
    elif kind == "executor":
        rated_client = db.query(models.Client).get(target_id)
        if rated_client:
            quality = rating.update_client_rating(db, rated_client)

    db.commit()
    result = {"ok": True, "by": kind, "target_id": target_id}
    if quality:
        result["rating"] = {"percent": quality["percent"]}
    return result


@app.post("/api/orders/{order_id}/lost-item")
def lost_item(order_id: int, request: Request, db: Session = Depends(get_db)):
    """Клиент сообщил, что оставил вещи в автомобиле (услуга такси).

    Кнопка живёт в карточке заказа в течение часа после завершения:
    уведомляем исполнителя и оператора.
    """
    o = db.query(models.Order).get(order_id)
    if not o:
        raise HTTPException(404, "Заказ не найден")
    if (o.service or "taxi") != "taxi":
        raise HTTPException(400, "Кнопка доступна только для услуг такси")
    if o.status != "completed":
        raise HTTPException(409, "Кнопка доступна после завершения заказа")
    done_at = _completed_at(db, o)
    if done_at and datetime.utcnow() - done_at > timedelta(hours=1):
        raise HTTPException(403, "Сообщить о вещах можно в течение часа после завершения")

    user = _optional_user(request.headers.get("Authorization", ""))
    if not user:
        raise HTTPException(401, "Требуется авторизация")
    max_id = _token_max_id(db, user)
    client = db.query(models.Client).filter_by(max_id=max_id).first()
    if not client or o.client_id != client.id:
        raise HTTPException(403, "Этот заказ вам не принадлежит")

    already = db.query(models.OrderEvent).filter(
        models.OrderEvent.order_id == o.id,
        models.OrderEvent.event == "lost_item",
    ).first()
    if already:
        raise HTTPException(409, "Сообщение об оставленных вещах уже отправлено")

    db.add(models.OrderEvent(
        order_id=o.id, event="lost_item", payload={"client_id": client.id},
    ))
    executor = db.query(models.Executor).get(o.executor_id) if o.executor_id else None
    if executor:
        db.add(models.Notification(
            user_max_id=str(executor.max_id),
            title="Клиент оставил вещи",
            body=f"Клиент сообщил, что оставил вещи в заказе №{o.id}. "
                 "Свяжитесь с ним через чат заказа.",
            order_id=o.id,
            category="order",
        ))
        # Лента оператора: помочь связаться, если чат молчит
        db.add(models.OperatorMessage(
            executor_id=executor.id,
            author_role="system",
            text=f"Клиент оставил вещи в заказе №{o.id} "
                 f"({o.from_address} → {o.to_address}). Связаться с клиентом.",
        ))
        try:
            send_max_message(
                executor.max_id,
                f"Клиент оставил вещи в заказе №{o.id}. Откройте чат заказа и свяжитесь с клиентом.",
                bot="executor",
            )
        except Exception:
            pass
    db.commit()
    return {"ok": True}

# --- admin ---
# Сессия администратора: случайный одноразовый токен в памяти процесса,
# ограничение попыток входа и сравнение пароля за постоянное время.
# Раньше cookie = sha256(пароля) — предсказуемая и вечная.
from app.security import (
    check_admin_password,
    create_admin_session,
    create_operator_session,
    get_admin,
    get_staff,
    hash_password,
    verify_password,
    invalidate_admin_session,
    invalidate_operator_session,
    login_allowed,
    register_failed_login,
)


@app.post("/api/admin/login")
def admin_login(data: dict, response: Response, request: Request):
    client_ip = request.client.host if request.client else "unknown"

    if not login_allowed(client_ip):
        raise HTTPException(
            status_code=429,
            detail="Слишком много попыток. Повторите через 5 минут",
        )

    if not check_admin_password(data.get("password")):
        register_failed_login(client_ip)
        raise HTTPException(status_code=401, detail="Неверный пароль")

    response.set_cookie(
        key="admin_session",
        value=create_admin_session(),
        httponly=True,
        samesite="lax",
        secure=True,
        max_age=60 * 60 * 12,
    )

    return {"ok": True}


@app.post("/api/admin/logout")
def admin_logout(response: Response, request: Request):
    invalidate_admin_session(request.cookies.get("admin_session"))
    response.delete_cookie("admin_session")
    return {"ok": True}


# --- Оператор (диспетчер): вход по логину/паролю + управление администратором ---
class OperatorAuthIn(BaseModel):
    login: str
    password: str


@app.post("/api/admin/operator/login")
def operator_login(data: OperatorAuthIn, response: Response, request: Request,
                   db: Session = Depends(get_db)):
    """Оператор входит по логину/паролю (выдаёт администратор)."""
    client_ip = request.client.host if request.client else "unknown"
    if not login_allowed(client_ip):
        raise HTTPException(429, "Слишком много попыток. Повторите через 5 минут")

    login = (data.login or "").strip()
    op = db.query(models.Operator).filter(models.Operator.login == login).first()
    if not op or not op.is_active or not verify_password(data.password or "", op.password_hash):
        register_failed_login(client_ip)
        raise HTTPException(401, "Неверный логин или пароль")

    response.set_cookie(
        key="operator_session",
        value=create_operator_session(op.id, op.login),
        httponly=True, samesite="lax", secure=True,
        max_age=60 * 60 * 12,
    )
    return {"ok": True, "role": "operator", "login": op.login, "name": op.name}


@app.post("/api/admin/operator/logout")
def operator_logout(response: Response, request: Request):
    invalidate_operator_session(request.cookies.get("operator_session"))
    response.delete_cookie("operator_session")
    return {"ok": True}


@app.get("/api/admin/whoami")
def admin_whoami(staff=Depends(get_staff), db: Session = Depends(get_db)):
    """Кто сейчас вошёл: администратор или оператор (для фильтра вкладок)."""
    if staff.get("role") == "operator":
        op = db.query(models.Operator).filter(
            models.Operator.id == staff.get("operator_id")
        ).first()
        return {
            "role": "operator",
            "login": staff.get("login"),
            "name": (op.name if op else None) or staff.get("login"),
        }
    return {"role": "admin", "name": "Администратор"}


class OperatorIn(BaseModel):
    login: str
    password: str | None = None
    name: str | None = None


@app.get("/api/admin/operators")
def admin_list_operators(admin=Depends(get_admin), db: Session = Depends(get_db)):
    rows = db.query(models.Operator).order_by(models.Operator.id.desc()).all()
    return {"operators": [{
        "id": r.id, "login": r.login, "name": r.name,
        "is_active": bool(r.is_active),
        "created_at": r.created_at.isoformat() if r.created_at else None,
    } for r in rows]}


@app.post("/api/admin/operators", status_code=201)
def admin_create_operator(data: OperatorIn, admin=Depends(get_admin), db: Session = Depends(get_db)):
    """Администратор назначает оператора: задаёт логин и пароль."""
    login = (data.login or "").strip()
    password = (data.password or "").strip()
    if not login or not password:
        raise HTTPException(400, "Логин и пароль обязательны")
    if db.query(models.Operator).filter(models.Operator.login == login).first():
        raise HTTPException(400, "Такой логин уже занят")
    op = models.Operator(
        login=login,
        password_hash=hash_password(password),
        name=(data.name or "").strip() or None,
    )
    db.add(op)
    db.commit()
    db.refresh(op)
    return {"ok": True, "id": op.id, "login": op.login}


@app.put("/api/admin/operators/{operator_id}")
def admin_update_operator(operator_id: int, data: OperatorIn,
                          admin=Depends(get_admin), db: Session = Depends(get_db)):
    op = db.query(models.Operator).get(operator_id)
    if not op:
        raise HTTPException(404, "Оператор не найден")
    if data.name is not None:
        op.name = data.name.strip() or None
    if (data.password or "").strip():
        op.password_hash = hash_password(data.password.strip())
    db.commit()
    return {"ok": True}


@app.post("/api/admin/operators/{operator_id}/toggle")
def admin_toggle_operator(operator_id: int, admin=Depends(get_admin), db: Session = Depends(get_db)):
    op = db.query(models.Operator).get(operator_id)
    if not op:
        raise HTTPException(404, "Оператор не найден")
    op.is_active = not op.is_active
    db.commit()
    return {"ok": True, "is_active": bool(op.is_active)}


@app.delete("/api/admin/operators/{operator_id}")
def admin_delete_operator(operator_id: int, admin=Depends(get_admin), db: Session = Depends(get_db)):
    op = db.query(models.Operator).get(operator_id)
    if op:
        db.delete(op)
        db.commit()
    return {"ok": True}


class SettingIn(BaseModel): key:str; value:str
@app.post("/api/admin/settings")
def set_setting(data: SettingIn, db: Session=Depends(get_db)):
    s=db.query(models.Setting).get(data.key)
    if not s: s=models.Setting(key=data.key,value=data.value); db.add(s)
    else: s.value=data.value
    db.commit(); return {"ok":True}
@app.get("/api/admin/settings")
def get_settings(db: Session=Depends(get_db)):
    return {s.key:s.value for s in db.query(models.Setting).all()}

from .routers.executors import router as executors_router
from .routers.tracking import router as tracking_router
from .services.eta import estimate_completion
from .services.max_notify import send_max_message
from .services.selforder import self_order_blocked

app.include_router(executors_router)
app.include_router(tracking_router)



from .routers.extras import router as extras_router

app.include_router(extras_router, prefix="/api")

from .routers.masters import router as masters_router

app.include_router(masters_router, prefix="/api")


class MasterOrderIn(BaseModel):
    service_id: int
    client_id: int | None = None
    from_address: str
    to_address: str = ""
    scheduled_at: str | None = None

@app.post("/api/masters/orders")
def create_master_order(data: MasterOrderIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    service = db.query(models.MasterService).get(data.service_id)
    if not service or not service.is_active:
        raise HTTPException(404, "Услуга не найдена")

    master = db.query(models.Executor).get(service.executor_id)
    if not master or master.status != "approved":
        raise HTTPException(409, "Мастер недоступен")

    scheduled = None
    if data.scheduled_at:
        scheduled = datetime.fromisoformat(data.scheduled_at.replace("Z", "+00:00"))

    price = service.price or 0
    commission_percent = 10
    commission_amount = round(price * commission_percent / 100, 2)

    client = _client_from_token(db, user)

    order = models.Order(
        client_id=client.id if client else data.client_id,
        service="master",
        tariff_code="master",
        status="created",
        from_address=data.from_address,
        to_address=data.to_address,
        distance_km=0,
        city_distance_km=0,
        out_city_distance_km=0,
        base_price=price,
        options_price=0,
        waiting_price=0,
        manual_increase=0,
        total_price=price,
        commission_percent=commission_percent,
        commission_amount=commission_amount,
        children=False,
        animals=False,
        child_seats=0,
        meta={"master_service_id": service.id, "master_id": service.executor_id},
        scheduled_at=scheduled
    )

    db.add(order)

    db.add(models.Notification(
        user_max_id=master.max_id,
        title="Новый заказ",
        body=f"Новый заказ: {service.title} — {price} ₽",
        order_id=order.id
    ))

    send_max_message(
        master.max_id,
        f"Новый заказ: {service.title} — {price} ₽. Откройте миниап исполнителя «Про».",
        bot="executor"
    )

    db.commit()
    db.refresh(order)
    return order

from .routers.notifications import router as notifications_router

app.include_router(notifications_router, prefix="/api")

from .routers.ads import router as ads_router

app.include_router(ads_router)

from .routers.clients import router as clients_router

app.include_router(clients_router, prefix="/api")


def _token_max_id(db: Session, user: dict):
    """users.id из JWT → max_user_id, по которому фактически ищутся Client/Executor."""
    try:
        u = db.query(models.User).get(int(user["id"]))
    except (TypeError, ValueError):
        return None
    return u.max_user_id if u else None


@app.get("/api/me/summary")
def me_summary(user=Depends(get_current_user), db: Session = Depends(get_db)):
    max_id = _token_max_id(db, user)

    client = db.query(models.Client).filter(
        models.Client.max_id == max_id
    ).first()

    executor = db.query(models.Executor).filter(
        models.Executor.max_id == max_id
    ).first()

    active_order = None
    last_completed = None

    if client:
        order = db.query(models.Order).filter(
            models.Order.client_id == client.id,
            models.Order.status.in_(["created", "assigned", "accepted", "in_progress"]),
        ).order_by(models.Order.id.desc()).first()

        if order:
            active_order = {
                "id": order.id,
                "service": order.service,
                "status": order.status,
                "total_price": order.total_price,
                "from_address": order.from_address,
                "to_address": order.to_address,
                "share_code": order.share_code,
            }

        completed = db.query(models.Order).filter(
            models.Order.client_id == client.id,
            models.Order.status == "completed",
        ).order_by(models.Order.id.desc()).first()

        if completed:
            rated = db.query(models.Rating).filter_by(
                order_id=completed.id, author_id=client.id
            ).first()
            done_at = _completed_at(db, completed)
            last_completed = {
                "id": completed.id,
                "service": completed.service,
                "from_address": completed.from_address,
                "to_address": completed.to_address,
                "rated": bool(rated),
                "rated_value": rated.value if rated else None,
                "completed_at": done_at.isoformat() if done_at else None,
            }

    if executor:
        order = db.query(models.Order).filter(
            models.Order.executor_id == executor.id,
            models.Order.status.in_(["accepted", "in_progress"]),
        ).order_by(models.Order.id.desc()).first()

        if order:
            active_order = {
                "id": order.id,
                "service": order.service,
                "status": order.status,
                "total_price": order.total_price,
                "from_address": order.from_address,
                "to_address": order.to_address,
                "share_code": order.share_code,
            }

        completed = db.query(models.Order).filter(
            models.Order.executor_id == executor.id,
            models.Order.status == "completed",
        ).order_by(models.Order.id.desc()).first()

        if completed:
            rated = db.query(models.Rating).filter_by(
                order_id=completed.id, author_id=executor.id
            ).first()
            done_at = _completed_at(db, completed)
            last_completed = {
                "id": completed.id,
                "service": completed.service,
                "from_address": completed.from_address,
                "to_address": completed.to_address,
                "rated": bool(rated),
                "rated_value": rated.value if rated else None,
                "completed_at": done_at.isoformat() if done_at else None,
            }

    # Рейтинг «батареей»: процент по оценкам за последние 100 заказов
    if client:
        rp = client.rating_percent if client.rating_percent is not None else 100
    elif executor:
        rp = executor.rating_percent if executor.rating_percent is not None else 100
    else:
        rp = 100

    return {
        "id": client.id if client else (executor.id if executor else None),
        "max_id": max_id,
        "phone": (client.phone if client else None) or (executor.phone if executor else None),
        "name": (client.name if client else None) or (executor.name if executor else None) or user.get("name"),
        "role": user.get("role"),
        "client_balance": client.balance if client else 0,
        "executor_balance": executor.balance if executor else 0,
        "executor_status": executor.status if executor else None,
        "rating_percent": rp,
        "active_order": active_order,
        "last_completed": last_completed,
    }


@app.post("/api/orders/{order_id}/cancel")
def cancel_order(order_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    order = db.query(models.Order).filter(models.Order.id == order_id).first()

    if not order:
        raise HTTPException(404, "Заказ не найден")

    max_id = _token_max_id(db, user)
    client = db.query(models.Client).filter(
        models.Client.max_id == max_id
    ).first()

    if not client or order.client_id != client.id:
        raise HTTPException(403, "Можно отменять только свои заказы")

    if order.status not in ["created", "accepted"]:
        raise HTTPException(400, "Этот заказ уже нельзя отменить")

    order.status = "cancelled"
    db.commit()

    if order.executor_id:
        executor = db.query(models.Executor).filter(
            models.Executor.id == order.executor_id
        ).first()

        if executor:
            db.add(models.Notification(
                user_max_id=str(executor.max_id),
                title="Заказ отменён",
                body=f"Клиент отменил заказ №{order.id}.",
                category="order"
            ))
            send_max_message(
                executor.max_id,
                f"Клиент отменил заказ №{order.id}.",
                bot="executor",
            )

    return {"ok": True, "status": order.status}


@app.post("/api/orders/{order_id}/executor-action")
def executor_order_action(
    order_id: int,
    action: dict,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = db.query(models.Order).filter(models.Order.id == order_id).first()

    if not order:
        raise HTTPException(404, "Заказ не найден")

    max_id = _token_max_id(db, user)
    executor = db.query(models.Executor).filter(
        models.Executor.max_id == max_id
    ).first()

    if not executor:
        raise HTTPException(403, "Только исполнитель может управлять заказом")

    act = action.get("action")

    if act == "accept":
        if order.status != "created" or order.executor_id:
            raise HTTPException(400, "Заказ уже занят или недоступен")

        # Анти-самозаказы: свой же номер у клиента и исполнителя — нельзя
        so = self_order_blocked(db, order, executor)
        if so:
            raise HTTPException(403, so)

        # Контроль рабочего времени: при лимите или во время отдыха заказ не принять
        work = worktime.work_state(db, executor.id)
        if work.get("status") == worktime.STATUS_BLOCKED:
            raise HTTPException(409, "Исчерпан лимит рабочего времени — новые заказы не поступают")
        if work.get("status") == worktime.STATUS_RESTING:
            raise HTTPException(409, "После смены нужен отдых 6 часов — вернёмся к заказам позже")
        worktime.start_session(db, executor.id)
        # Успешный приём сбрасывает счётчик пропусков
        executor.skip_streak = 0

        order.executor_id = executor.id
        order.status = "accepted"

        if order.client_id:
            client = db.query(models.Client).filter(
                models.Client.id == order.client_id
            ).first()

            if client:
                db.add(models.Notification(
                    user_max_id=str(client.max_id),
                    title="Заказ принят",
                    body=f"Исполнитель принял ваш заказ №{order.id}.",
                    category="order"
                ))

    elif act == "start":
        if order.executor_id != executor.id or order.status != "accepted":
            raise HTTPException(400, "Нельзя начать этот заказ")

        order.status = "in_progress"
        worktime.touch_session(db, executor.id)

        if order.client_id:
            client = db.query(models.Client).filter(
                models.Client.id == order.client_id
            ).first()

            if client:
                db.add(models.Notification(
                    user_max_id=str(client.max_id),
                    title="Заказ выполняется",
                    body=f"Исполнитель начал заказ №{order.id}.",
                    category="order"
                ))

    elif act == "complete":
        if order.executor_id != executor.id or order.status != "in_progress":
            raise HTTPException(400, "Нельзя завершить этот заказ")

        order.status = "completed"

        commission_percent = 15.0
        setting = db.query(models.Setting).filter(
            models.Setting.key == "commission_percent"
        ).first()

        if setting:
            try:
                commission_percent = float(setting.value)
            except Exception:
                pass

        commission = round(order.total_price * commission_percent / 100, 2)
        executor.balance += order.total_price - commission
        db.add(models.ExecutorBalanceOp(
            executor_id=executor.id,
            type="earning",
            amount=round(order.total_price - commission, 2),
            order_id=order.id,
            comment=f"Заказ №{order.id}",
        ))
        worktime.touch_session(db, executor.id)

        if order.client_id:
            client = db.query(models.Client).filter(
                models.Client.id == order.client_id
            ).first()

            if client:
                db.add(models.Notification(
                    user_max_id=str(client.max_id),
                    title="Заказ завершён",
                    body=f"Заказ №{order.id} завершён. Спасибо, что выбрали «Про».",
                    category="order"
                ))
                send_max_message(
                    client.max_id,
                    f"Заказ №{order.id} завершён. Спасибо, что выбрали «Про»!",
                    bot="client",
                )

    else:
        raise HTTPException(400, "Неизвестное действие")

    db.commit()
    db.refresh(order)

    return {"ok": True, "status": order.status}
@app.get("/api/executor/available-orders")
def executor_available_orders(
    service: str | None = None,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    executor = db.query(models.Executor).filter(
        models.Executor.max_id == _token_max_id(db, user)
    ).first()

    if not executor:
        raise HTTPException(403, "Только исполнитель может видеть заказы")

    query = db.query(models.Order).filter(
        models.Order.status == "created",
        models.Order.executor_id.is_(None),
    )

    if service:
        query = query.filter(models.Order.service == service)

    # Анти-самозаказы: свои заказы не показываем в пуле
    orders = [o for o in query.order_by(models.Order.id.desc()).limit(50).all()
              if not self_order_blocked(db, o, executor)]

    return {"orders": [{
        "id": o.id,
        "service": o.service,
        "tariff_code": o.tariff_code,
        "from_address": o.from_address,
        "to_address": o.to_address,
        "distance_km": o.distance_km,
        "total_price": o.total_price,
        "status": o.status,
    } for o in orders]}
@app.get("/api/admin/orders")
def admin_orders(
    status: str | None = None,
    service: str | None = None,
    staff=Depends(get_staff),
    db: Session = Depends(get_db),
):
    query = db.query(models.Order)

    if status:
        query = query.filter(models.Order.status == status)

    if service:
        query = query.filter(models.Order.service == service)

    orders = query.order_by(models.Order.id.desc()).limit(100).all()

    return {"orders": [{
        "id": o.id,
        "service": o.service,
        "tariff_code": o.tariff_code,
        "status": o.status,
        "from_address": o.from_address,
        "to_address": o.to_address,
        "total_price": o.total_price,
        "client_id": o.client_id,
        "executor_id": o.executor_id,
        "created_at": o.created_at.isoformat() if o.created_at else None,
    } for o in orders]}


@app.get("/api/admin/clients/{client_id}/profile")
def admin_client_profile(client_id: int, staff=Depends(get_staff), db: Session=Depends(get_db)):
    """Полная карточка клиента для админки: заказы, баланс, избранное."""
    client = db.query(models.Client).filter(models.Client.id == client_id).first()
    if not client:
        raise HTTPException(404, "Клиент не найден")

    orders = db.query(models.Order).filter(
        models.Order.client_id == client_id
    ).order_by(models.Order.id.desc()).limit(50).all()

    active = next(
        (o for o in orders if o.status in ("created", "assigned", "accepted", "in_progress")),
        None,
    )

    return {
        "client": {
            "id": client.id,
            "max_id": client.max_id,
            "name": client.name or client.phone or client.max_id,
            "phone": client.phone,
            "balance": round(float(client.balance or 0), 2),
            "orders_count": len(orders),
            "total_sum": round(sum(float(o.total_price or 0) for o in orders), 2),
            "favorites": [
                {"id": o.id, "title": o.favorite_title, "from_address": o.from_address, "to_address": o.to_address}
                for o in orders if o.favorite
            ],
            "created_at": client.created_at.isoformat() if client.created_at else None,
        },
        "active_order_id": active.id if active else None,
        "orders": [{
            "id": o.id,
            "status": o.status,
            "service": o.service,
            "from_address": o.from_address,
            "to_address": o.to_address,
            "total_price": o.total_price,
            "favorite": bool(o.favorite),
            "favorite_title": o.favorite_title,
            "created_at": o.created_at.isoformat() if o.created_at else None,
        } for o in orders],
    }


@app.post("/api/admin/clients/{client_id}/notifications")
def admin_notify_client(
    client_id: int,
    data: dict,
    admin=Depends(get_admin),
    db: Session=Depends(get_db),
):
    """Админ/оператор пишет клиенту."""
    client = db.query(models.Client).filter(models.Client.id == client_id).first()
    if not client:
        raise HTTPException(404, "Клиент не найден")

    title = (data.get("title") or "Сообщение от оператора").strip()
    body = (data.get("body") or "").strip()
    if not body:
        raise HTTPException(400, "Пустое сообщение")

    db.add(models.Notification(
        user_max_id=str(client.max_id),
        title=title,
        body=body[:500],
    ))
    db.commit()
    try:
        send_max_message(client.max_id, f"{title}\n{body[:500]}", bot="client")
    except Exception:
        pass
    return {"ok": True}


@app.get("/api/admin/clients")
def admin_clients(staff=Depends(get_staff), db: Session = Depends(get_db)):
    # Клиенты живут в таблице clients (а не users) — там же баланс и телефон
    clients = db.query(models.Client).order_by(models.Client.id.desc()).all()

    return {"clients": [{
        "id": c.id,
        "max_id": c.max_id,
        "name": c.name or c.phone or c.max_id,
        "phone": c.phone,
        "balance": c.balance or 0,
    } for c in clients]}


@app.get("/api/admin/executors")
def admin_executors(staff=Depends(get_staff), db: Session = Depends(get_db)):
    executors = db.query(models.Executor).order_by(models.Executor.id.desc()).all()

    result = []
    for e in executors:
        # Статистика текущей смены: лимит 12 ч, предупреждение, отдых
        try:
            work = worktime.work_state(db, e.id)
        except Exception:
            work = {"status": "ok", "worked_minutes": 0, "remaining_minutes": 720,
                    "limit_minutes": 720, "rest_minutes": 360, "started_at": None,
                    "rest_until": None}

        result.append({
            "id": e.id,
            "max_id": e.max_id,
            "name": e.name,
            "phone": e.phone,
            "status": e.status,
            "active_role": e.active_role,
            "balance": e.balance,
            "is_online": bool(e.is_online),
            "skip_streak": int(e.skip_streak or 0),
            "rating_percent": e.rating_percent if e.rating_percent is not None else 100,
            "work": work,
            "last_seen_at": e.last_seen_at.isoformat() if e.last_seen_at else None,
        })
    return {"executors": result}


@app.post("/api/admin/executors/{executor_id}/balance")
def change_executor_balance(
    executor_id: int,
    data: dict,
    admin=Depends(get_admin),
    db: Session = Depends(get_db),
):
    executor = db.query(models.Executor).filter(
        models.Executor.id == executor_id
    ).first()

    if not executor:
        raise HTTPException(404, "Исполнитель не найден")

    try:
        amount = float(data.get("amount"))
    except Exception:
        raise HTTPException(400, "Некорректная сумма")

    executor.balance += amount
    db.add(models.ExecutorBalanceOp(
        executor_id=executor.id,
        type="topup" if amount > 0 else "correction",
        amount=amount,
        comment=str(data.get("comment") or "").strip() or None,
    ))
    db.add(models.Notification(
        user_max_id=str(executor.max_id),
        title="Изменение баланса",
        body=f"Администратор изменил баланс на {amount} ₽.",
    ))
    send_max_message(
        executor.max_id,
        f"Ваш баланс изменён на {amount} ₽. Текущий баланс: {round(executor.balance, 2)} ₽.",
        bot="executor",
    )
    db.commit()

    return {"ok": True, "balance": executor.balance}


@app.post("/api/admin/clients/{client_id}/balance")
def change_client_balance(
    client_id: int,
    data: dict,
    admin=Depends(get_admin),
    db: Session = Depends(get_db),
):
    client = db.query(models.Client).filter(
        models.Client.id == client_id
    ).first()

    if not client:
        raise HTTPException(404, "Клиент не найден")

    try:
        amount = float(data.get("amount"))
    except Exception:
        raise HTTPException(400, "Некорректная сумма")

    client.balance += amount
    db.add(models.Notification(
        user_max_id=str(client.max_id),
        title="Изменение баланса",
        body=f"Администратор изменил баланс на {amount} ₽.",
    ))
    send_max_message(
        client.max_id,
        f"Ваш баланс изменён на {amount} ₽. Текущий баланс: {round(client.balance, 2)} ₽.",
        bot="client",
    )
    db.commit()

    return {"ok": True, "balance": client.balance}


def _district_of(address):
    """Район (муниципальное образование) Краснодарского края из полного
    адреса заказа — формат OSM: «…, муниципальный округ Анапа,
    Краснодарский край, Южный федеральный округ, …, Россия».
    """
    if not address:
        return None
    parts = [p.strip() for p in address.split(",")]
    for i, p in enumerate(parts):
        if "Краснодарский край" in p and i > 0 and parts[i - 1]:
            return parts[i - 1]
    # Запасной вариант: «… район» без упоминания края
    for p in parts:
        if p.endswith("район"):
            return p
    return None


@app.get("/api/admin/dashboard")
def admin_dashboard(
    period: int = 30,
    role: str | None = None,
    district: str | None = None,
    staff=Depends(get_staff),
    db: Session = Depends(get_db),
):
    """Дашборд сервиса: ключевые показатели с выборкой по районам
    Краснодарского края, фильтр по ролям, заблокированные и
    отстранённые исполнители.

    Роль применяется к заказам через исполнителя; район — по адресу
    подачи. Фильтр по району для исполнителей означает «работал
    в районе за период».
    """
    since = None if period <= 0 else datetime.utcnow() - timedelta(days=period)

    # Исполнители и их роли одним запросом
    executors = db.query(models.Executor).all()
    roles_by_exec = {}
    if executors:
        for r in db.query(models.ExecutorRole).filter(
            models.ExecutorRole.executor_id.in_([e.id for e in executors])
        ).all():
            roles_by_exec.setdefault(r.executor_id, []).append(r.role)

    # Действующие отстранения
    susp_by_exec = {
        s.executor_id: s
        for s in db.query(models.ExecutorSuspension).filter(
            models.ExecutorSuspension.revoked_at.is_(None),
            models.ExecutorSuspension.ends_at > datetime.utcnow(),
        ).all()
    }

    # Заказы: район считаем из адреса подачи
    orders = db.query(models.Order).all()
    period_rows = []
    districts = set()
    undef_exists = False
    for o in orders:
        d = _district_of(o.from_address)
        if d:
            districts.add(d)
        else:
            undef_exists = bool(orders)
        if since is None or (o.created_at and o.created_at >= since):
            period_rows.append(
                (o, d, roles_by_exec.get(o.executor_id) if o.executor_id else None)
            )

    # Район → заказы
    if district == "__none__":
        district_rows = [r for r in period_rows if r[1] is None]
    elif district:
        district_rows = [r for r in period_rows if r[1] == district]
    else:
        district_rows = period_rows

    # Исполнители: район (работал в районе за период) → роль
    f_exec_district = executors
    if district:
        d_ids = {r[0].executor_id for r in district_rows if r[0].executor_id}
        f_exec_district = [e for e in executors if e.id in d_ids]
    if role:
        f_executors = [
            e for e in f_exec_district if role in roles_by_exec.get(e.id, [])
        ]
        role_ids = {e.id for e in f_executors}
        rows = [r for r in district_rows if r[0].executor_id in role_ids]
    else:
        f_executors = f_exec_district
        rows = district_rows

    # Итоги по заказам
    completed = [r for r in rows if r[0].status == "completed"]
    cancelled = [r for r in rows if r[0].status == "cancelled"]
    active = [r for r in rows if r[0].status in (
        "created", "assigned", "accepted", "in_progress",
    )]
    revenue = round(sum(float(r[0].total_price or 0) for r in completed), 2)
    commission = round(sum(float(r[0].commission_amount or 0) for r in completed), 2)
    client_ids = {r[0].client_id for r in rows if r[0].client_id}

    # Динамика по дням
    day_map = {}
    for o, _, _ in rows:
        if o.created_at:
            k = o.created_at.date()
            day_map[k] = day_map.get(k, 0) + 1
    by_day = [
        {"day": k.strftime("%d.%m"), "orders": v}
        for k, v in sorted(day_map.items())
    ]

    # Районы (период + роль, без районного фильтра — чтобы видеть выборку целиком)
    role_ids_all = (
        {e.id for e in executors if role in roles_by_exec.get(e.id, [])}
        if role else None
    )
    rows_bd = [
        r for r in period_rows
        if role_ids_all is None or r[0].executor_id in role_ids_all
    ]
    dist_map = {}
    for o, d, _ in rows_bd:
        key = d or "Не определён"
        m = dist_map.setdefault(
            key, {"district": key, "orders": 0, "completed": 0, "revenue": 0.0}
        )
        m["orders"] += 1
        if o.status == "completed":
            m["completed"] += 1
            m["revenue"] += float(o.total_price or 0)
    by_district = sorted(dist_map.values(), key=lambda x: -x["orders"])
    for m in by_district:
        m["revenue"] = round(m["revenue"], 2)

    # Роли: исполнители (район, без ролевого фильтра) + заказы за период/район
    role_map = {}
    for e in f_exec_district:
        for rl in roles_by_exec.get(e.id, []):
            m = role_map.setdefault(rl, {
                "role": rl, "executors": 0, "online": 0,
                "blocked": 0, "suspended": 0, "orders": 0,
            })
            m["executors"] += 1
            if e.is_online:
                m["online"] += 1
            if e.status == "rejected":
                m["blocked"] += 1
            if e.id in susp_by_exec:
                m["suspended"] += 1
    for o, _, ex_roles in district_rows:
        if o.executor_id and ex_roles:
            for rl in ex_roles:
                m = role_map.setdefault(rl, {
                    "role": rl, "executors": 0, "online": 0,
                    "blocked": 0, "suspended": 0, "orders": 0,
                })
                m["orders"] += 1
    by_role = sorted(role_map.values(), key=lambda x: -x["executors"])

    # Заблокированные (отклонённые) и отстранённые — в текущей выборке
    def _exec_json(e):
        return {
            "id": e.id,
            "name": e.name,
            "phone": e.phone,
            "status": e.status,
            "active_role": e.active_role,
            "rating_percent": (
                e.rating_percent if e.rating_percent is not None else 100
            ),
        }

    blocked = [_exec_json(e) for e in f_executors if e.status == "rejected"]
    suspended = []
    for e in f_executors:
        s = susp_by_exec.get(e.id)
        if s:
            item = _exec_json(e)
            item.update({
                "ends_at": s.ends_at.isoformat() if s.ends_at else None,
                "reason": s.reason,
                "source": s.source,
            })
            suspended.append(item)

    return {
        "period": period,
        "role": role,
        "district": district,
        "totals": {
            "orders": len(rows),
            "completed": len(completed),
            "cancelled": len(cancelled),
            "active": len(active),
            "revenue": revenue,
            "commission": commission,
            "avg_check": round(revenue / len(completed), 2) if completed else 0,
            "clients": len(client_ids),
            "executors": len(f_executors),
            "online": sum(1 for e in f_executors if e.is_online),
        },
        "by_day": by_day,
        "roles": sorted({r for v in roles_by_exec.values() for r in v}),
        "districts": sorted(districts) + (["__none__"] if undef_exists else []),
        "by_district": by_district,
        "by_role": by_role,
        "blocked": blocked,
        "suspended": suspended,
    }


@app.get("/api/admin/analytics")
def admin_analytics(admin=Depends(get_admin), db: Session = Depends(get_db)):
    orders = db.query(models.Order).all()

    total_orders = len(orders)
    completed_orders = [o for o in orders if o.status == "completed"]
    completed_count = len(completed_orders)

    gross_volume = sum(o.total_price or 0 for o in completed_orders)
    average_check = round(gross_volume / completed_count, 2) if completed_count else 0

    commission_percent = 15.0
    setting = db.query(models.Setting).filter(
        models.Setting.key == "commission_percent"
    ).first()

    if setting:
        try:
            commission_percent = float(setting.value)
        except Exception:
            pass

    service_revenue = round(
        gross_volume * commission_percent / 100,
        2,
    )

    from datetime import timedelta

    today = datetime.utcnow().date()
    orders_by_day = []

    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        day_start = datetime.combine(day, datetime.min.time())
        day_end = day_start + timedelta(days=1)

        count = db.query(models.Order).filter(
            models.Order.created_at >= day_start,
            models.Order.created_at < day_end,
        ).count()

        orders_by_day.append({
            "date": day.strftime("%d.%m"),
            "count": count,
        })

    services = {}

    for o in orders:
        key = o.service or "other"
        services[key] = services.get(key, 0) + 1

    clients_count = db.query(models.Client).count()
    executors_count = db.query(models.Executor).count()

    active_executors = db.query(models.Executor).filter(
        models.Executor.status == "online"
    ).count()

    # Модули «Работа» и «Аренда» пока не подключены к БД —
    # раньше запросы падали с NameError (Job и RentalListing не существуют)
    pending_jobs = 0
    pending_rentals = 0

    return {
        "total_orders": total_orders,
        "completed_orders": completed_count,
        "gross_volume": gross_volume,
        "average_check": average_check,
        "commission_percent": commission_percent,
        "service_revenue": service_revenue,
        "clients_count": clients_count,
        "executors_count": executors_count,
        "active_executors": active_executors,
        "pending_jobs": pending_jobs,
        "pending_rentals": pending_rentals,
        "services": services,
        "orders_by_day": orders_by_day,
    }

@app.get("/api/admin/orders/export.csv")
def export_orders_csv(admin=Depends(get_admin), db: Session = Depends(get_db)):
    orders = db.query(models.Order).order_by(models.Order.id.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "ID",
        "Услуга",
        "Тариф",
        "Статус",
        "Откуда",
        "Куда",
        "Расстояние, км",
        "Сумма",
        "Клиент ID",
        "Исполнитель ID",
        "Создан",
    ])

    for o in orders:
        writer.writerow([
            o.id,
            o.service,
            o.tariff_code,
            o.status,
            o.from_address,
            o.to_address,
            o.distance_km,
            o.total_price,
            o.client_id,
            o.executor_id,
            o.created_at,
        ])

    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=orders.csv"
        },
    )
@app.get("/api/admin/clients/export.csv")
def export_clients_csv(admin=Depends(get_admin), db: Session = Depends(get_db)):
    clients = db.query(models.Client).order_by(models.Client.id.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "ID", "MAX ID", "Имя", "Телефон", "Баланс", "Создан"
    ])

    for c in clients:
        writer.writerow([
            c.id, c.max_id, c.name, c.phone, c.balance, c.created_at
        ])

    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=clients.csv"},
    )


@app.get("/api/admin/executors/export.csv")
def export_executors_csv(admin=Depends(get_admin), db: Session = Depends(get_db)):
    executors = db.query(models.Executor).order_by(models.Executor.id.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "ID", "MAX ID", "Имя", "Телефон", "Роль", "Статус", "Баланс", "Создан"
    ])

    for e in executors:
        writer.writerow([
            e.id, e.max_id, e.name, e.phone, e.active_role,
            e.status, e.balance, e.created_at
        ])

    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=executors.csv"},
    )

# Geo routing
from app.routers.geo import router as geo_router
app.include_router(geo_router)


# --- Городские зоны ---
import json
from sqlalchemy import text as sa_text


class CityZoneIn(BaseModel):
    city: str
    name: str
    geometry: dict


def _city_zone_geometry_sql(value: dict, db: Session):
    try:
        geojson = json.dumps(value)
    except Exception:
        raise HTTPException(status_code=400, detail="Некорректная граница зоны")

    row = db.execute(
        sa_text("""
            SELECT
                ST_GeometryType(ST_GeomFromGeoJSON(:geo)) AS geometry_type,
                ST_IsValid(ST_GeomFromGeoJSON(:geo)) AS is_valid,
                ST_IsEmpty(ST_GeomFromGeoJSON(:geo)) AS is_empty
        """),
        {"geo": geojson},
    ).one()

    if row.geometry_type != "ST_Polygon":
        raise HTTPException(status_code=400, detail="Граница зоны должна быть полигоном")

    if not row.is_valid or row.is_empty:
        raise HTTPException(status_code=400, detail="Граница зоны некорректна")

    return geojson


@app.get("/api/admin/city-zones")
def list_city_zones(
    city: str = "",
    admin=Depends(get_admin),
    db: Session = Depends(get_db),
):
    params = {}
    where = "deleted_at IS NULL"

    if city.strip():
        where += " AND lower(btrim(city)) = lower(btrim(:city))"
        params["city"] = city.strip()

    rows = db.execute(
        sa_text(f"""
            SELECT
                id, city, name, version,
                ST_AsGeoJSON(geometry)::json AS geometry,
                created_at, updated_at
            FROM tariff_city_zones
            WHERE {where}
            ORDER BY lower(btrim(city)), name, id
        """),
        params,
    ).mappings().all()

    return {
        "zones": [
            {
                "id": row["id"],
                "city": row["city"],
                "name": row["name"],
                "version": row["version"],
                "geometry": row["geometry"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            }
            for row in rows
        ]
    }


@app.post("/api/admin/city-zones", status_code=201)
def create_city_zone(
    data: CityZoneIn,
    admin=Depends(get_admin),
    db: Session = Depends(get_db),
):
    city = data.city.strip()
    name = data.name.strip()

    if not city or not name:
        raise HTTPException(status_code=400, detail="Укажите город и название зоны")

    geojson = _city_zone_geometry_sql(data.geometry, db)

    try:
        row = db.execute(
            sa_text("""
                INSERT INTO tariff_city_zones (city, name, geometry)
                VALUES (:city, :name, ST_GeomFromGeoJSON(:geo))
                RETURNING id, version
            """),
            {"city": city, "name": name, "geo": geojson},
        ).one()

        db.execute(
            sa_text("""
                INSERT INTO tariff_city_zone_versions
                    (zone_id, version, city, name, geometry, action)
                VALUES
                    (:zone_id, :version, :city, :name,
                     ST_GeomFromGeoJSON(:geo), 'created')
            """),
            {
                "zone_id": row.id,
                "version": row.version,
                "city": city,
                "name": name,
                "geo": geojson,
            },
        )

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Не удалось сохранить границу зоны")

    return {"ok": True, "id": row.id, "version": row.version}


@app.put("/api/admin/city-zones/{zone_id}")
def update_city_zone(
    zone_id: int,
    data: CityZoneIn,
    admin=Depends(get_admin),
    db: Session = Depends(get_db),
):
    city = data.city.strip()
    name = data.name.strip()

    if not city or not name:
        raise HTTPException(status_code=400, detail="Укажите город и название зоны")

    geojson = _city_zone_geometry_sql(data.geometry, db)

    zone = db.execute(
        sa_text("""
            SELECT id, version
            FROM tariff_city_zones
            WHERE id = :zone_id AND deleted_at IS NULL
            FOR UPDATE
        """),
        {"zone_id": zone_id},
    ).one_or_none()

    if not zone:
        db.rollback()
        raise HTTPException(status_code=404, detail="Зона не найдена")

    new_version = zone.version + 1

    try:
        db.execute(
            sa_text("""
                UPDATE tariff_city_zones
                SET city = :city,
                    name = :name,
                    geometry = ST_GeomFromGeoJSON(:geo),
                    version = :version,
                    updated_at = now()
                WHERE id = :zone_id
            """),
            {
                "city": city,
                "name": name,
                "geo": geojson,
                "version": new_version,
                "zone_id": zone_id,
            },
        )

        db.execute(
            sa_text("""
                INSERT INTO tariff_city_zone_versions
                    (zone_id, version, city, name, geometry, action)
                VALUES
                    (:zone_id, :version, :city, :name,
                     ST_GeomFromGeoJSON(:geo), 'updated')
            """),
            {
                "zone_id": zone_id,
                "version": new_version,
                "city": city,
                "name": name,
                "geo": geojson,
            },
        )

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Не удалось обновить границу зоны")

    return {"ok": True, "id": zone_id, "version": new_version}


@app.delete("/api/admin/city-zones/{zone_id}", status_code=204)
def delete_city_zone(
    zone_id: int,
    admin=Depends(get_admin),
    db: Session = Depends(get_db),
):
    zone = db.execute(
        sa_text("""
            SELECT
                id, version, city, name,
                ST_AsGeoJSON(geometry)::text AS geometry
            FROM tariff_city_zones
            WHERE id = :zone_id AND deleted_at IS NULL
            FOR UPDATE
        """),
        {"zone_id": zone_id},
    ).one_or_none()

    if not zone:
        db.rollback()
        raise HTTPException(status_code=404, detail="Зона не найдена")

    try:
        db.execute(
            sa_text("""
                UPDATE tariff_city_zones
                SET deleted_at = now(), updated_at = now()
                WHERE id = :zone_id
            """),
            {"zone_id": zone_id},
        )

        db.execute(
            sa_text("""
                INSERT INTO tariff_city_zone_versions
                    (zone_id, version, city, name, geometry, action)
                VALUES
                    (:zone_id, :version, :city, :name,
                     ST_GeomFromGeoJSON(:geo), 'deleted')
            """),
            {
                "zone_id": zone.id,
                "version": zone.version + 1,
                "city": zone.city,
                "name": zone.name,
                "geo": zone.geometry,
            },
        )

        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Не удалось удалить зону")


@app.get("/api/admin/city-zones/{zone_id}/history")
def city_zone_history(
    zone_id: int,
    admin=Depends(get_admin),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        sa_text("""
            SELECT
                version, city, name, action, created_at,
                ST_AsGeoJSON(geometry)::json AS geometry
            FROM tariff_city_zone_versions
            WHERE zone_id = :zone_id
            ORDER BY version DESC
        """),
        {"zone_id": zone_id},
    ).mappings().all()

    return {
        "history": [
            {
                "version": row["version"],
                "city": row["city"],
                "name": row["name"],
                "action": row["action"],
                "created_at": row["created_at"],
                "geometry": row["geometry"],
            }
            for row in rows
        ]
    }


# --- PRO: protected OpenFreeMap proxy ---
import json as _map_json
from urllib.request import (
    Request as _MapRequest,
    build_opener as _map_build_opener,
    HTTPRedirectHandler as _MapRedirectHandler,
)
from urllib.error import HTTPError as _MapHTTPError, URLError as _MapURLError
from urllib.parse import quote as _map_quote
from fastapi.responses import Response as _MapResponse


class _MapNoRedirect(_MapRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _map_rewrite(value):
    if isinstance(value, dict):
        return {key: _map_rewrite(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_map_rewrite(item) for item in value]
    if isinstance(value, str):
        for prefix in (
            "https://tiles.openfreemap.org/",
            "http://tiles.openfreemap.org/",
            "//tiles.openfreemap.org/",
        ):
            if value.startswith(prefix):
                return "/api/admin/map-proxy/" + value[len(prefix):]
    return value


@app.get("/api/admin/map-proxy/{resource:path}", include_in_schema=False)
def pro_map_proxy(resource: str, admin=Depends(get_admin)):
    allowed = ("styles/", "sprites/", "fonts/", "planet/", "natural_earth/")

    if (
        (resource != "planet" and not resource.startswith(allowed))
        or "\\" in resource
        or any(part in (".", "..") for part in resource.split("/"))
        or any(ord(char) < 32 for char in resource)
    ):
        raise HTTPException(status_code=400, detail="Недопустимый ресурс карты")

    url = "https://tiles.openfreemap.org/" + _map_quote(
        resource, safe="/@,._-"
    )

    req = _MapRequest(
        url,
        headers={
            "User-Agent": "PRO-admin-map/1.0",
            "Accept-Encoding": "identity",
        },
    )

    try:
        opener = _map_build_opener(_MapNoRedirect())
        with opener.open(req, timeout=15) as response:
            content = response.read(8 * 1024 * 1024 + 1)
            content_type = response.headers.get(
                "Content-Type", "application/octet-stream"
            )
            content_encoding = response.headers.get("Content-Encoding", "")

        if len(content) > 8 * 1024 * 1024:
            raise HTTPException(status_code=502, detail="Ресурс карты слишком большой")

        # Не передаём сжатые данные как несжатые.
        if content_encoding and content_encoding.lower() != "identity":
            raise HTTPException(
                status_code=502,
                detail="Источник вернул неожиданно сжатый ресурс",
            )

        if "json" in content_type.lower():
            value = _map_json.loads(content)
            content = _map_json.dumps(
                _map_rewrite(value), ensure_ascii=False
            ).encode("utf-8")
            content_type = "application/json"

        return _MapResponse(
            content=content,
            headers={
                "Content-Type": content_type,
                "Cache-Control": "private, max-age=300",
                "X-Content-Type-Options": "nosniff",
            },
        )
    except HTTPException:
        raise
    except _MapHTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"OpenFreeMap ответил HTTP {exc.code}",
        )
    except (_MapURLError, TimeoutError, OSError):
        raise HTTPException(
            status_code=504,
            detail="Сервер не получил ресурс OpenFreeMap вовремя",
        )
    except (ValueError, UnicodeError):
        raise HTTPException(
            status_code=502,
            detail="Некорректный JSON ресурса карты",
        )


# PRO_MAP_PATCH
def _map_rewrite(value):
    if isinstance(value, dict):
        return {
            key: _map_rewrite(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_map_rewrite(item) for item in value]
    if isinstance(value, str):
        return value.replace(
            "/api/admin/map-proxy/",
            "/api/geo/map-proxy/",
        )
    return value


@app.get("/api/geo/map-proxy/{resource:path}", include_in_schema=False)
def map_proxy(
    resource: str,
    user=Depends(get_current_user),
):
    if not user.get("id"):
        raise HTTPException(status_code=401, detail="Требуется авторизация")

    # Пользователь проверен dependency выше.
    # Повторно HTTP-маршрут админки не вызывается:
    # используется его функция загрузки фиксированного источника.
    response = pro_map_proxy(resource=resource, admin=True)

    content_type = response.headers.get("content-type", "")
    if "json" in content_type.lower():
        data = _map_json.loads(response.body)
        response.body = _map_json.dumps(
            _map_rewrite(data),
            ensure_ascii=False,
        ).encode("utf-8")
        response.headers["content-length"] = str(len(response.body))

    return response

# ORDER CHAIN ROUTER
from .routers.order_chain import router as order_chain_router
app.include_router(order_chain_router, prefix="/api")
