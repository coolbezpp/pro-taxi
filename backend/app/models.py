from sqlalchemy import BigInteger
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.sql import func
from geoalchemy2 import Geometry
from app.db import Base
from datetime import datetime

class User(Base):
    __tablename__="users"
    id=Column(Integer,primary_key=True)
    max_user_id=Column(String,unique=True,index=True)
    phone=Column(String,unique=True,index=True)
    role=Column(String,default="client")  # client, executor, operator, admin
    status=Column(String,default="active")
    risk_score=Column(Float,default=0)
    created_at=Column(DateTime,server_default=func.now())

class Tariff(Base):
    __tablename__="tariffs"
    id=Column(Integer,primary_key=True)
    code=Column(String,unique=True)  # standard, intercity
    name=Column(String)
    base_price=Column(Float)
    included_km=Column(Float)
    city_per_km=Column(Float)
    out_city_per_km=Column(Float)
    min_price=Column(Float,default=0)
    per_km=Column(Float,default=0)
    coefficient=Column(Float,default=1.0)
    active=Column(Boolean,default=True)

class Settlement(Base):
    __tablename__="settlements"
    id=Column(Integer,primary_key=True)
    name=Column(String,index=True)
    population=Column(Integer)
    lat=Column(Float); lon=Column(Float)
    intercity_allowed=Column(Boolean,default=False)
    geometry=Column(Geometry("POLYGON",4326),nullable=True)

class Order(Base):
    __tablename__="orders"
    id=Column(Integer,primary_key=True)
    client_id=Column(Integer,index=True)
    executor_id=Column(Integer,index=True,nullable=True)
    service=Column(String,default="taxi")
    tariff_code=Column(String,default="standard")
    status=Column(String,default="created")
    from_address=Column(String); to_address=Column(String)
    from_lat=Column(Float); from_lon=Column(Float); to_lat=Column(Float); to_lon=Column(Float)
    distance_km=Column(Float,default=0)
    city_distance_km=Column(Float,default=0)
    out_city_distance_km=Column(Float,default=0)
    base_price=Column(Float,default=0)
    options_price=Column(Float,default=0)
    waiting_price=Column(Float,default=0)
    manual_increase=Column(Float,default=0)
    total_price=Column(Float,default=0)
    commission_percent=Column(Float,default=15)
    commission_amount=Column(Float,default=0)
    children=Column(Integer,default=0)
    animals=Column(Boolean,default=False)
    child_seats=Column(Integer,default=0)
    scheduled_at=Column(DateTime,nullable=True)
    meta=Column(JSON,default=dict)
    created_at=Column(DateTime,server_default=func.now())
    planned_completion_at = Column(DateTime, nullable=True)
    chain_reserved_order_id = Column(Integer, nullable=True)
    # Код публичной ссылки для «Поделиться поездкой» — без личных данных
    share_code = Column(String(32), unique=True, nullable=True)
    # Избранное клиента: заказ можно пометить и переименовать
    favorite = Column(Boolean, nullable=False, default=False)
    favorite_title = Column(String(120), nullable=True)


class OrderEvent(Base):
    __tablename__="order_events"
    id=Column(Integer,primary_key=True)
    order_id=Column(Integer,ForeignKey("orders.id"))
    event=Column(String); payload=Column(JSON,default=dict)
    created_at=Column(DateTime,server_default=func.now())

class Rating(Base):
    __tablename__="ratings"
    id=Column(Integer,primary_key=True)
    order_id=Column(Integer,ForeignKey("orders.id"))
    author_id=Column(Integer); target_id=Column(Integer)
    value=Column(String)  # like, dislike
    comment=Column(Text,nullable=True)


class ExecutorBalanceOp(Base):
    """Журнал операций по балансу исполнителя: заработок, пополнения, корректировки."""
    __tablename__="executor_balance_ops"

    id=Column(Integer,primary_key=True)
    executor_id=Column(Integer,index=True,nullable=False)
    type=Column(String,nullable=False,default="earning")  # earning, topup, correction
    amount=Column(Float,nullable=False,default=0)
    order_id=Column(Integer,nullable=True)
    comment=Column(String,nullable=True)
    created_at=Column(DateTime,server_default=func.now())


class ExecutorPhotoCheck(Base):
    """Фото-контроль исполнителя: оператор запрашивает фото, исполнитель
    присылает, модератор принимает или отклоняет с комментарием."""
    __tablename__="executor_photo_checks"

    id=Column(Integer,primary_key=True)
    executor_id=Column(Integer,index=True,nullable=False)
    kind=Column(String,nullable=False,default="car")   # car, documents, selfie, plate
    title=Column(String,nullable=False)
    comment=Column(Text,nullable=True)                 # комментарий оператора
    status=Column(String,nullable=False,default="pending")  # requested, pending, approved, rejected
    photo_url=Column(Text,nullable=True)
    decision_comment=Column(Text,nullable=True)        # комментарий модератора
    decided_by=Column(Integer,nullable=True)
    decided_at=Column(DateTime,nullable=True)
    requested_at=Column(DateTime,server_default=func.now())
    created_at=Column(DateTime,server_default=func.now())
    answered_at=Column(DateTime,nullable=True)


class ExecutorVehicle(Base):
    """Транспорт исполнителя: заполняет администратор/оператор при
    регистрации, исполнитель видит и обновляет пробег (нужен для
    раздела «Техобслуживание»)."""
    __tablename__="executor_vehicles"

    id=Column(Integer,primary_key=True)
    executor_id=Column(Integer,index=True,unique=True,nullable=False)
    brand=Column(String,nullable=True)              # марка
    model=Column(String,nullable=True)              # модель
    color=Column(String,nullable=True)              # цвет
    plate=Column(String,nullable=True)              # госномер
    year=Column(Integer,nullable=True)              # год выпуска
    seats=Column(Integer,nullable=True)             # мест (включая водителя)
    photo_url=Column(Text,nullable=True)            # фото авто (data-URL)
    mileage=Column(Integer,nullable=True,default=0) # текущий пробег, км
    approved=Column(Boolean,nullable=True,default=False)  # проверено админом
    last_reminder_at=Column(DateTime,nullable=True) # напоминание о техобслуживании
    created_at=Column(DateTime,server_default=func.now())
    updated_at=Column(DateTime,nullable=True)


class VehicleMaintenance(Base):
    """Работы по техобслуживанию авто: исполнитель вносит выполненную
    работу, пробег на момент выполнения и интервал повтора в км."""
    __tablename__="vehicle_maintenance"

    id=Column(Integer,primary_key=True)
    executor_id=Column(Integer,index=True,nullable=False)
    title=Column(String,nullable=False)                    # работа: «замена масла»…
    note=Column(String,nullable=True)                      # заметка (сервис, детали)
    done_at=Column(DateTime,nullable=True)                 # дата выполнения
    done_mileage=Column(Integer,nullable=True,default=0)   # пробег при выполнении, км
    interval_km=Column(Integer,nullable=True,default=0)    # повторять через N км
    notified_at=Column(DateTime,nullable=True)             # напоминание о сроке отправлено
    created_at=Column(DateTime,server_default=func.now())


class ExecutorWorkSession(Base):
    """Рабочая смена исполнителя: отсчёт 12 часов идёт от первого принятого заказа."""
    __tablename__="executor_work_sessions"

    id=Column(Integer,primary_key=True)
    executor_id=Column(Integer,index=True,nullable=False)
    started_at=Column(DateTime,nullable=False)     # первый принятый заказ
    last_activity_at=Column(DateTime,nullable=False)
    ended_at=Column(DateTime,nullable=True)        # конец смены
    warned_at=Column(DateTime,nullable=True)       # предупреждение о блокировке
    created_at=Column(DateTime,server_default=func.now())


class OrderMessage(Base):
    """Сообщения в чате по заказу: клиент и исполнитель."""
    __tablename__="order_messages"

    id=Column(Integer,primary_key=True)
    order_id=Column(Integer,index=True,nullable=False)
    author_role=Column(String,nullable=False)   # client | executor
    author_id=Column(Integer,nullable=True)
    text=Column(Text,nullable=False)
    created_at=Column(DateTime,server_default=func.now())

class AdBanner(Base):
    __tablename__="ad_banners"
    id=Column(Integer,primary_key=True)
    title=Column(String); image_url=Column(String); link=Column(String)
    placement=Column(String,default="home")
    active=Column(Boolean,default=True)

class Setting(Base):
    __tablename__="settings"
    key=Column(String,primary_key=True)
    value=Column(String)


class CommissionSetting(Base):
    __tablename__ = "commission_settings"

    id = Column(Integer, primary_key=True)
    service = Column(String, unique=True, nullable=False)
    percent = Column(Float, nullable=False, default=10)


class Executor(Base):
    __tablename__ = "executors"

    id = Column(Integer, primary_key=True)
    max_id = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    role = Column(String, nullable=False, default="driver")
    status = Column(String, nullable=False, default="pending")
    active_role = Column(String, nullable=True)
    balance = Column(Float, nullable=False, default=0)
    rating_likes = Column(Integer, nullable=False, default=0)
    rating_dislikes = Column(Integer, nullable=False, default=0)
    # Рейтинг «батареей»: процент like за последние 100 оценённых заказов
    rating_percent = Column(Integer, nullable=True, default=100)
    # Последний порог, о котором уведомляли (3 — 80%, 2 — 60%, 1 — 50%)
    rating_notified_level = Column(Integer, nullable=True)
    # На линии / снят с линии (в том числе автоматически за пропуск заказов)
    is_online = Column(Boolean, nullable=False, default=False)
    # Сколько заказов подряд пропущено (два подряд — автоснятие с линии)
    skip_streak = Column(Integer, nullable=False, default=0)
    # Последняя известная геопозиция — для отслеживания движения
    last_lat = Column(Float, nullable=True)
    last_lon = Column(Float, nullable=True)
    last_seen_at = Column(DateTime, nullable=True)
    # Одна живая сессия входа: при логине на новом телефоне создаётся новый
    # sid (лежит в токене) — токен со старым sid сразу перестаёт действовать
    session_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ExecutorRole(Base):
    __tablename__ = "executor_roles"

    id = Column(Integer, primary_key=True)
    executor_id = Column(Integer, nullable=False)
    role = Column(String, nullable=False)


class OrderExtra(Base):
    __tablename__ = "order_extras"

    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, nullable=False)
    executor_id = Column(Integer, nullable=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    price = Column(Float, nullable=False, default=0)
    status = Column(String, nullable=False, default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)


class MasterService(Base):
    __tablename__ = "master_services"

    id = Column(Integer, primary_key=True)
    executor_id = Column(Integer, nullable=False)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    price = Column(Float, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True)
    user_max_id = Column(String, nullable=False)
    title = Column(String, nullable=False)
    body = Column(String, nullable=True)
    order_id = Column(Integer, nullable=True)
    # service — сервисные сообщения (усталость, администратор, фото-контроль);
    # order — события по заказам (в профиле исполнителя не показываются)
    category = Column(String, nullable=False, default="service")
    is_read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Operator(Base):
    """Оператор (диспетчер): назначается администратором, входит по
    логину/паролю в админку с ограниченным набором вкладок."""
    __tablename__ = "operators"

    id = Column(Integer, primary_key=True)
    login = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    name = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now())


class OperatorMessage(Base):
    """Переписка клиента/исполнителя с оператором + системные события."""
    __tablename__ = "operator_messages"

    id = Column(Integer, primary_key=True)
    # Строка принадлежит либо исполнителю, либо клиенту (ровно одна из связей).
    executor_id = Column(Integer, index=True, nullable=True)
    client_id = Column(Integer, index=True, nullable=True)
    author_role = Column(String, nullable=False, default="admin")  # executor | client | admin | system
    text = Column(Text, nullable=False)
    is_read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, server_default=func.now())


class Client(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True)
    max_id = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    balance = Column(Float, default=0)
    # Рейтинг «батареей»: процент like за последние 100 оценённых заказов
    rating_percent = Column(Integer, nullable=True, default=100)
    # Антифрод: подтверждённый фрод пары — запрет новых заказов
    # (снимается оператором через false_positive)
    blocked = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ExecutorSuspension(Base):
    """Временное отстранение исполнителя от заказов: авто (низкий рейтинг)
    или вручную администратором. Пока активно — назначение/приём заказов
    и выход на линию заблокированы; уже назначенные поездки завершить можно."""
    __tablename__ = "executor_suspensions"

    id = Column(Integer, primary_key=True)
    executor_id = Column(Integer, index=True, nullable=False)
    starts_at = Column(DateTime, nullable=False)
    ends_at = Column(DateTime, nullable=False)
    reason = Column(Text, nullable=True)
    source = Column(String, nullable=False, default="admin")   # auto, admin
    created_by = Column(String, nullable=True)                 # имя админа или system
    created_at = Column(DateTime, server_default=func.now())
    revoked_at = Column(DateTime, nullable=True)
    revoked_by = Column(String, nullable=True)


class TariffCityZone(Base):
    __tablename__ = "tariff_city_zones"

    id = Column(BigInteger, primary_key=True)
    city = Column(String(160), nullable=False, index=True)
    name = Column(String(160), nullable=False)
    geometry = Column(
        Geometry(geometry_type="POLYGON", srid=4326),
        nullable=False,
    )
    version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())
    deleted_at = Column(DateTime, nullable=True)


class TariffCityZoneVersion(Base):
    __tablename__ = "tariff_city_zone_versions"

    id = Column(BigInteger, primary_key=True)
    zone_id = Column(
        BigInteger,
        ForeignKey("tariff_city_zones.id"),
        nullable=False,
    )
    version = Column(Integer, nullable=False)
    city = Column(String(160), nullable=False)
    name = Column(String(160), nullable=False)
    geometry = Column(
        Geometry(geometry_type="POLYGON", srid=4326),
        nullable=False,
    )
    action = Column(String(16), nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class Ad(Base):
    """Рекламный блок на главной странице миниаппа.

    Два раздела: бизнес-реклама местного бизнеса (home) и
    афиша городских мероприятий (events, у событий есть дата).
    Отдаётся публичным эндпоинтом /api/ads (без персональных данных).
    """

    __tablename__ = "ads"

    id = Column(Integer, primary_key=True)
    title = Column(String(160), nullable=False)
    description = Column(String(400), nullable=True)
    image_name = Column(String(255), nullable=True)   # файл в каталоге медиа
    link = Column(String(500), nullable=True)         # "/taxi" либо "https://..."
    placement = Column(String(20), nullable=False, default="home")  # home | events
    event_date = Column(DateTime, nullable=True)      # когда мероприятие
    active = Column(Boolean, nullable=False, default=True)
    position = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, server_default=func.now())


class DeviceSession(Base):
    """Устройство входа — опора антифрода «свой–чужой» (docs/ANTIFRAUD.md).

    device_id генерируется в localStorage миниаппа; сам IP не храним —
    только sha256(ip + серверный секрет), чтобы сравнивать кластера.
    """

    __tablename__ = "device_sessions"

    id = Column(Integer, primary_key=True)
    user_max_id = Column(String, index=True, nullable=False)
    role = Column(String, nullable=False)              # client | executor
    device_id = Column(String, index=True, nullable=False)
    ip_hash = Column(String, nullable=True)
    ua_hash = Column(String, nullable=True)
    first_seen = Column(DateTime, server_default=func.now())
    last_seen = Column(DateTime, server_default=func.now())


class FraudSignal(Base):
    """Сработавший сигнал пары клиент:исполнитель.

    На (pair_key, code) — один активный ряд: при пересчёте живой сигнал
    обновляется, снятый остаётся в журнале с active=False.
    """

    __tablename__ = "fraud_signals"

    id = Column(Integer, primary_key=True)
    pair_key = Column(String, index=True, nullable=False)
    order_id = Column(Integer, nullable=True)
    code = Column(String, nullable=False)
    weight = Column(Float, nullable=False, default=0)
    meta = Column(JSON, default=dict)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now())


class FraudReview(Base):
    """Очередь на проверку: одна строка на пару — риск и решение человека.

    Автобанов нет: статусы open → review → under_review ставит скор,
    confirmed / false_positive — только оператор (docs/ANTIFRAUD.md §4–5).
    """

    __tablename__ = "fraud_reviews"

    id = Column(Integer, primary_key=True)
    pair_key = Column(String, unique=True, index=True, nullable=False)
    client_id = Column(Integer, nullable=True)
    executor_id = Column(Integer, nullable=True)
    risk_score = Column(Float, nullable=False, default=0)
    status = Column(String, nullable=False, default="open")
    # «Семья/компания»: пара проверена и больше не беспокоит
    allowlisted = Column(Boolean, nullable=False, default=False)
    resolved_by = Column(String, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())


class TrackingCode(Base):
    """Одноразовый код входа для страницы GPS-трекинга (/executor/track.html).

    GPS в вебвью MAX заблокирован самим приложением — водитель берёт код
    в миниаппе и вводит его в системном браузере, где navigator.geolocation
    работает штатно. Хранится только sha256-хэш кода; живёт 10 минут,
    применяется один раз (used_at).
    """

    __tablename__ = "tracking_codes"

    id = Column(Integer, primary_key=True)
    executor_id = Column(Integer, ForeignKey("executors.id"), nullable=False, index=True)
    code_hash = Column(String, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())




