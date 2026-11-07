"""Юнит-тесты order_flow.apply — без БД: сессия подменяется фейком.

Запуск:  python -m pytest tests -q   (из папки backend)
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# order_flow тянет app.db → create_engine(database_url) и обязательный
# JWT_SECRET. На сервере их задаёт окружение контейнера, локально —
# подставляем значения только если их нет: движок в тестах не используется.
os.environ.setdefault("JWT_SECRET", "unit-test-only")
os.environ.setdefault("DATABASE_URL", "sqlite://")

from fastapi import HTTPException

from app import models, order_states
from app.services import order_flow


class _FakeDb:
    """Минимальная сессия: apply() только add() и flush(), коммитит эндпоинт."""

    def __init__(self):
        self.added = []

    def add(self, obj):
        self.added.append(obj)

    def flush(self):
        pass


def test_apply_moves_status_and_writes_event():
    """take: created → accepted, событие accepted с actor в payload."""
    db = _FakeDb()
    order = models.Order(id=7, status=order_states.CREATED, executor_id=3)

    res = order_flow.apply(db, order, "take", "executor", 3)

    assert res is order
    assert order.status == order_states.ACCEPTED
    ev = db.added[0]
    assert isinstance(ev, models.OrderEvent)
    assert ev.order_id == 7
    assert ev.event == "accepted"
    assert ev.payload == {"actor": "executor", "actor_id": 3}


def test_apply_actor_id_always_in_payload():
    """actor_id пишется всегда, даже когда его нет (None) — форма payload единая."""
    db = _FakeDb()
    order = models.Order(id=8, status=order_states.CREATED)

    order_flow.apply(db, order, "client_cancel", "client")

    assert order.status == order_states.CANCELLED
    ev = db.added[0]
    assert ev.event == "cancelled"
    assert ev.payload == {"actor": "client", "actor_id": None}


def test_apply_decline_clears_executor():
    """Отказ: заказ возвращается в ленту, исполнитель обнуляется."""
    db = _FakeDb()
    order = models.Order(id=9, status=order_states.ASSIGNED, executor_id=5)

    order_flow.apply(db, order, "decline", "executor", 5)

    assert order.status == order_states.CREATED
    assert order.executor_id is None
    assert db.added[0].event == "declined"


def test_apply_invalid_transition_is_409():
    """Недопустимый переход (complete из assigned) → HTTP 409 с русским текстом."""
    db = _FakeDb()
    order = models.Order(id=10, status=order_states.ASSIGNED, executor_id=5)

    try:
        order_flow.apply(db, order, "complete", "executor", 5)
    except HTTPException as e:
        assert e.status_code == 409
        assert "Завершить заказ" in str(e.detail)
    else:
        raise AssertionError("недопустимый переход должен давать HTTPException 409")
    assert db.added == []


class _Exec:
    """Заглушка исполнителя: хватает для charge_commission."""
    id = 5
    balance = 1000.0


class _Query:
    def __init__(self, op, executor):
        self._op = op
        self._executor = executor

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self._op

    def get(self, _id):
        return self._executor


class _DbWithOp:
    """Сессия, в которой по заказу уже есть операция баланса."""

    def __init__(self, op, executor):
        self._op = op
        self._executor = executor
        self.added = []

    def query(self, _model):
        return _Query(self._op, self._executor)

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        pass


def test_charge_commission_no_double_charge():
    """Защита от двойного начисления: операция по заказу уже есть → не добавляем."""
    order = models.Order(
        id=11, status=order_states.COMPLETED, executor_id=5,
        total_price=1000, commission_amount=150,
    )
    existing = models.ExecutorBalanceOp(
        executor_id=5, type="commission", amount=-150, order_id=11,
    )
    executor = _Exec()
    db = _DbWithOp(existing, executor)

    assert order_flow.charge_commission(db, order) == 0
    assert db.added == []
    assert executor.balance == 1000.0  # баланс не тронут
