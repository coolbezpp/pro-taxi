"""Интеграционный тест жизненного цикла заказа (см. LIFECYCLE_CHECKLIST.md).

Прогон идёт на FastAPI TestClient против ТЕСТОВОЙ БД PostgreSQL (нужен PostGIS).
Подключение задаётся переменной окружения TEST_DATABASE_URL. Без неё — все тесты
пропускаются через pytest.skip.

Боевая БД не затрагивается ни при каких условиях:
* тест отказывается работать, если TEST_DATABASE_URL пуст либо совпадает с
  settings.database_url (рабочая строка подключения приложения);
* дополнительно имя БД в URL должно содержать "test" — защита от случайного
  указания продовой базы;
* сессии приложения подменяются через app.dependency_overrides[get_db];
* DROP TABLE не выполняется: создаётся схема (если её нет), после прогона
  убираются только строки, созданные этим тестом.

Запуск:
    set TEST_DATABASE_URL=postgresql://pro:pro@localhost:5432/pro_test
    python -m pytest tests -q
"""

import os
import uuid
from datetime import datetime, timedelta

import pytest

TEST_DATABASE_URL = (os.getenv("TEST_DATABASE_URL") or "").strip()

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="TEST_DATABASE_URL не задан — тестовая БД недоступна, тесты пропускаются",
)

# Префикс для всех тестовых строк — по нему находим и убираем данные после прогона
MARK = "lifecycle_test_"


def _db_name(url: str) -> str:
    """Имя базы из строки подключения (после последнего '/')."""
    tail = url.rsplit("/", 1)[-1]
    return tail.split("?")[0]


@pytest.fixture(scope="module")
def env():
    """Тестовая схема, TestClient и токены участников (клиент, 2 исполнителя)."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import NullPool

    from app import models
    from app.config import settings
    from app.db import Base, get_db
    from app.main import app
    from app.security import create_admin_session, create_token

    # --- защита боевой БД -------------------------------------------------
    if not TEST_DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL не задан")
    if TEST_DATABASE_URL == settings.database_url:
        pytest.skip("TEST_DATABASE_URL совпадает с рабочей БД приложения")
    if "test" not in _db_name(TEST_DATABASE_URL).lower():
        pytest.skip(
            "имя БД в TEST_DATABASE_URL не содержит 'test' — "
            "отказ от работы, чтобы не затронуть рабочую базу"
        )

    engine = create_engine(TEST_DATABASE_URL, poolclass=NullPool)
    try:
        Base.metadata.create_all(engine)
    except Exception as exc:  # pragma: no cover — зависит от окружения
        engine.dispose()
        pytest.skip(f"не удалось подготовить тестовую схему: {exc}")

    TestSession = sessionmaker(bind=engine, autoflush=False)

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    # Все запросы приложения идут только в тестовую БД
    app.dependency_overrides[get_db] = override_get_db

    # Убираем токены MAX, чтобы шаги не ходили в внешний API мессенджера
    saved_tokens = (
        settings.max_client_bot_token,
        settings.max_executor_bot_token,
    )
    settings.max_client_bot_token = ""
    settings.max_executor_bot_token = ""

    suffix = uuid.uuid4().hex[:8]
    created: dict = {"tariff": None, "order_ids": [], "user_ids": [],
                     "client_ids": [], "executor_ids": []}

    db = TestSession()
    try:
        # --- клиент ------------------------------------------------------
        user = models.User(
            max_user_id=MARK + "client_" + suffix,
            phone="+7999" + suffix,
            role="client",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        created["user_ids"].append(user.id)
        client_token = create_token(user.id, "client")

        # --- два исполнителя (второй — для проверки 403) -----------------
        executors = []
        for n in (1, 2):
            ex = models.Executor(
                max_id=MARK + f"exec{n}_" + suffix,
                name=f"Тестовый исполнитель {n}",
                phone="+7999" + f"{n:02d}" + suffix[:6],
                role="driver",
                status="approved",
                balance=0.0,
            )
            db.add(ex)
            db.commit()
            db.refresh(ex)
            db.add(models.ExecutorRole(executor_id=ex.id, role="driver"))
            db.commit()
            created["executor_ids"].append(ex.id)
            executors.append(ex)

        # --- тариф (если в тестовой БД его нет) --------------------------
        tariff = db.query(models.Tariff).filter_by(code="standard", active=True).first()
        if not tariff:
            tariff = models.Tariff(
                code="standard",
                name="Стандарт (тест)",
                base_price=100.0,
                included_km=2.0,
                city_per_km=15.0,
                out_city_per_km=25.0,
                min_price=100.0,
                coefficient=1.0,
                active=True,
            )
            db.add(tariff)
            db.commit()
            created["tariff"] = tariff.code
    finally:
        db.close()

    from fastapi.testclient import TestClient

    test_client = TestClient(app)  # без контекста: startup-задачи не стартуют

    data = {
        "client": test_client,
        "client_token": client_token,
        "executors": executors,
        "exec_token": create_token(executors[0].id, "executor"),
        "exec2_token": create_token(executors[1].id, "executor"),
        "session": TestSession,
        # cookie персонала: get_staff читает её из заголовка Cookie
        "staff_headers": {"Cookie": f"admin_session={create_admin_session()}"},
        "suffix": suffix,
        "created": created,
    }

    yield data

    # --- уборка: только созданные тестом строки --------------------------
    app.dependency_overrides.pop(get_db, None)
    settings.max_client_bot_token, settings.max_executor_bot_token = saved_tokens

    db = TestSession()
    try:
        order_ids = created["order_ids"]
        if order_ids:
            db.query(models.OrderEvent).filter(
                models.OrderEvent.order_id.in_(order_ids)
            ).delete(synchronize_session=False)
            db.query(models.ExecutorBalanceOp).filter(
                models.ExecutorBalanceOp.order_id.in_(order_ids)
            ).delete(synchronize_session=False)
            db.query(models.Order).filter(models.Order.id.in_(order_ids)).delete(
                synchronize_session=False
            )
        db.query(models.Notification).filter(
            models.Notification.user_max_id.like(MARK + "%")
        ).delete(synchronize_session=False)
        db.query(models.ExecutorRole).filter(
            models.ExecutorRole.executor_id.in_(created["executor_ids"])
        ).delete(synchronize_session=False)
        db.query(models.Executor).filter(
            models.Executor.id.in_(created["executor_ids"])
        ).delete(synchronize_session=False)
        db.query(models.Client).filter(
            models.Client.max_id.like(MARK + "%")
        ).delete(synchronize_session=False)
        db.query(models.User).filter(
            models.User.id.in_(created["user_ids"])
        ).delete(synchronize_session=False)
        if created["tariff"]:
            db.query(models.Tariff).filter_by(
                code=created["tariff"]
            ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()
    engine.dispose()


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _order_payload(n: int = 1) -> dict:
    """Тело POST /api/orders: обязательные поля client_id и distance_km."""
    return {
        "client_id": 1,
        "service": "taxi",
        "tariff_code": "standard",
        "from_address": "Тест, ул. Первомайская, 1",
        "to_address": "Тест, ул. Гагарина, 10",
        "from_lat": 45.035,
        "from_lon": 38.975,
        "to_lat": 45.045,
        "to_lon": 38.985,
        "distance_km": float(n) + 4.0,
        "city_km": float(n) + 4.0,
        "out_km": 0.0,
    }


def _create_order(env) -> dict:
    resp = env["client"].post(
        "/api/orders",
        headers=_auth(env["client_token"]),
        json=_order_payload(),
    )
    assert resp.status_code == 200, resp.text
    order = resp.json()
    env["created"]["order_ids"].append(order["id"])
    return order


def _events(env, order_id: int) -> list:
    from app import models

    db = env["session"]()
    try:
        rows = (
            db.query(models.OrderEvent)
            .filter(models.OrderEvent.order_id == order_id)
            .order_by(models.OrderEvent.id)
            .all()
        )
        return [{"event": r.event, "payload": r.payload or {}} for r in rows]
    finally:
        db.close()


def _get_order(env, order_id: int, token: str = None) -> dict:
    resp = env["client"].get(
        f"/api/orders/{order_id}",
        headers=_auth(token or env["client_token"]),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


# --- 1. команды без токена -------------------------------------------------
def test_commands_without_token_rejected(env):
    order = _create_order(env)
    url = f"/api/orders/{order['id']}"
    for path in ("/accept", "/arrived", "/start", "/complete"):
        resp = env["client"].post(url + path)
        assert resp.status_code in (401, 403), (path, resp.status_code, resp.text)
    resp = env["client"].post(url + "/cancel", json={"reason": "тест"})
    assert resp.status_code in (401, 403), resp.text
    resp = env["client"].get(url)
    assert resp.status_code in (401, 403), resp.text


# --- 2. создание заказа ----------------------------------------------------
def test_create_order_status_created(env):
    order = _create_order(env)
    assert order["status"] == "created"
    assert order.get("share_code")

    events = _events(env, order["id"])
    assert any(e["event"] == "created" for e in events), events

    stored = _get_order(env, order["id"])
    assert stored["status"] == "created"


# --- 3. take → arrived → start → complete ---------------------------------
def test_take_arrive_start_complete(env):
    order = _create_order(env)
    executor = env["executors"][0]
    url = f"/api/orders/{order['id']}"

    resp = env["client"].post(
        f"{url}/assign/{executor.id}", headers=_auth(env["exec_token"])
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "accepted"

    resp = env["client"].post(f"{url}/arrived", headers=_auth(env["exec_token"]))
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "arrived"

    resp = env["client"].post(f"{url}/start", headers=_auth(env["exec_token"]))
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "in_progress"

    resp = env["client"].post(f"{url}/complete", headers=_auth(env["exec_token"]))
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "completed"

    names = [e["event"] for e in _events(env, order["id"])]
    for expected in ("accepted", "arrived", "started", "completed"):
        assert expected in names, (expected, names)

    # ровно одно удержание комиссии с баланса исполнителя
    from app import models

    db = env["session"]()
    try:
        ops = (
            db.query(models.ExecutorBalanceOp)
            .filter(models.ExecutorBalanceOp.order_id == order["id"])
            .all()
        )
        assert len(ops) == 1, [(o.type, o.amount) for o in ops]
        assert ops[0].type in ("commission", "earning")
        assert ops[0].amount <= 0
    finally:
        db.close()

    stored = _get_order(env, order["id"])
    assert stored["status"] == "completed"


# --- 4. повторный complete → 409 -----------------------------------------
def test_repeat_complete_conflict(env):
    order = _create_order(env)
    executor = env["executors"][0]
    url = f"/api/orders/{order['id']}"

    for path, ok in (
        (f"/assign/{executor.id}", 200),
        ("/arrived", 200),
        ("/start", 200),
        ("/complete", 200),
        ("/complete", 409),
    ):
        resp = env["client"].post(
            url + path, headers=_auth(env["exec_token"])
        )
        assert resp.status_code == ok, (path, resp.status_code, resp.text)

    from app import models

    db = env["session"]()
    try:
        ops = (
            db.query(models.ExecutorBalanceOp)
            .filter(models.ExecutorBalanceOp.order_id == order["id"])
            .all()
        )
        assert len(ops) == 1, "повторное завершение не должно давать второе удержание"
    finally:
        db.close()


# --- 5. чужой исполнитель → 403 -------------------------------------------
def test_foreign_executor_forbidden(env):
    order = _create_order(env)
    executor = env["executors"][0]
    url = f"/api/orders/{order['id']}"

    resp = env["client"].post(
        f"{url}/assign/{executor.id}", headers=_auth(env["exec_token"])
    )
    assert resp.status_code == 200, resp.text

    resp = env["client"].post(f"{url}/complete", headers=_auth(env["exec2_token"]))
    assert resp.status_code == 403, (resp.status_code, resp.text)
    assert _get_order(env, order["id"])["status"] == "accepted"


# --- 6. отмена клиентом с причиной ----------------------------------------
def test_client_cancel_with_reason(env):
    order = _create_order(env)
    resp = env["client"].post(
        f"/api/orders/{order['id']}/cancel",
        headers=_auth(env["client_token"]),
        json={"reason": "Долго ждать"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "cancelled"

    stored = _get_order(env, order["id"])
    assert stored["status"] == "cancelled"
    assert stored.get("cancel_reason") == "Долго ждать"

    names = [e["event"] for e in _events(env, order["id"])]
    assert "cancelled" in names, names

    # повторная отмена идемпотентна
    resp = env["client"].post(
        f"/api/orders/{order['id']}/cancel",
        headers=_auth(env["client_token"]),
        json={"reason": "Долго ждать"},
    )
    assert resp.status_code == 200, resp.text


# --- 7. назначение оператором и таймаут 60 с ------------------------------
def test_staff_assign_and_accept_timeout(env):
    from app import models, order_flow
    from app.order_states import ASSIGNED_ACCEPT_SECONDS

    order = _create_order(env)
    executor = env["executors"][0]
    url = f"/api/orders/{order['id']}"

    resp = env["client"].post(
        f"{url}/assign/{executor.id}", headers=env["staff_headers"]
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "assigned"

    events = _events(env, order["id"])
    assigned = [e for e in events if e["event"] == "assigned"]
    assert assigned and assigned[0]["payload"].get("actor") == "staff", events

    db = env["session"]()
    try:
        # отсчёт до таймаута идёт от момента назначения оператором
        row = db.query(models.Order).get(order["id"])
        left = order_flow.accept_seconds_left(db, row)
        assert left is not None and 0 < left <= ASSIGNED_ACCEPT_SECONDS, left

        # искусственно «переводим время»: назначение было 2 минуты назад
        ev = (
            db.query(models.OrderEvent)
            .filter(
                models.OrderEvent.order_id == order["id"],
                models.OrderEvent.event == "assigned",
            )
            .order_by(models.OrderEvent.id.desc())
            .first()
        )
        ev.created_at = datetime.utcnow() - timedelta(seconds=120)
        db.commit()
        db.refresh(row)
        assert order_flow.accept_seconds_left(db, row) == 0

        # то же делает фоновый _order_timeout_watcher (шаг 8 чек-листа)
        ex = db.query(models.Executor).get(executor.id)
        before = int(ex.skip_streak or 0)
        order_flow.apply(
            db, row, "decline", "timeout", executor.id, {"reason": "timeout"}
        )
        ex.skip_streak = before + 1
        db.commit()
        db.refresh(row)
        assert row.status == "created", row.status
        assert int(ex.skip_streak or 0) == before + 1
    finally:
        db.close()

    events = _events(env, order["id"])
    declined = [e for e in events if e["event"] == "declined"]
    assert declined, events
    assert declined[0]["payload"].get("reason") == "timeout", declined
    assert _get_order(env, order["id"])["status"] == "created"


# --- 8. отказ исполнителя с причиной --------------------------------------
def test_executor_cancel_with_reason(env):
    order = _create_order(env)
    executor = env["executors"][0]
    url = f"/api/orders/{order['id']}"

    resp = env["client"].post(
        f"{url}/assign/{executor.id}", headers=_auth(env["exec_token"])
    )
    assert resp.status_code == 200, resp.text

    # без причины — ошибка валидации
    resp = env["client"].post(f"{url}/executor-cancel", headers=_auth(env["exec_token"]))
    assert resp.status_code == 422, (resp.status_code, resp.text)

    resp = env["client"].post(
        f"{url}/executor-cancel",
        headers=_auth(env["exec_token"]),
        json={"reason": "Клиент передумал"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "created"

    events = _events(env, order["id"])
    cancelled = [e for e in events if e["event"] == "executor_cancelled"]
    assert cancelled, events
    assert cancelled[0]["payload"].get("reason") == "Клиент передумал", cancelled
