"""Юнит-тесты жизненного цикла заказа и денег — без БД и без pytest.

Запуск:  python tests/test_order_states.py   (из папки backend)
Либо:    pytest tests/   — если pytest установлен.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import order_states as st
from app import pricing


def test_lifecycle_take():
    """Лента: взяли заказ → на месте → поездка → завершено."""
    s = st.CREATED
    s = st.next_status(s, "take")
    assert s == st.ACCEPTED, s
    s = st.next_status(s, "arrive")
    assert s == st.ARRIVED, s
    s = st.next_status(s, "start")
    assert s == st.IN_PROGRESS, s
    s = st.next_status(s, "complete")
    assert s == st.COMPLETED, s


def test_lifecycle_assigned():
    """Оператор назначил → исполнитель принял → дальше как в ленте."""
    s = st.next_status(st.CREATED, "assign")
    assert s == st.ASSIGNED, s
    s = st.next_status(s, "accept")
    assert s == st.ACCEPTED, s
    s = st.next_status(s, "arrive")
    assert s == st.ARRIVED, s


def test_decline_returns_to_feed():
    """Отказ или таймаут принятия — заказ снова в ленте, у исполнителя пусто."""
    s = st.next_status(st.CREATED, "assign")
    s = st.next_status(s, "decline")
    assert s == st.CREATED, s


def test_executor_cancel_requeues():
    """Отказ после принятия (на месте/едет) — снова created, без штрафов."""
    assert st.next_status(st.ACCEPTED, "executor_cancel") == st.CREATED
    assert st.next_status(st.ARRIVED, "executor_cancel") == st.CREATED


def test_invalid_transitions():
    def fails(cur, action):
        try:
            st.next_status(cur, action)
        except ValueError:
            return True
        return False

    # Пропускать этапы нельзя
    assert fails(st.CREATED, "start")
    assert fails(st.CREATED, "complete")
    assert fails(st.ASSIGNED, "arrive")      # сначала «Принять»
    assert fails(st.ACCEPTED, "start")       # сначала «Я на месте»
    assert fails(st.ARRIVED, "complete")     # сначала «Начать поездку»
    # Завершённое и отменённое не двигаются
    assert fails(st.COMPLETED, "start")
    assert fails(st.CANCELLED, "accept")
    # Начать поездку можно только после «На месте»
    assert fails(st.IN_PROGRESS, "arrive")
    # Неизвестное действие
    assert fails(st.CREATED, "teleport")


def test_client_cancel_window():
    """Клиент отменяет до начала поездки включительно, не во время неё."""
    for cur in (st.CREATED, st.CHAIN_RESERVED, st.ASSIGNED, st.ACCEPTED, st.ARRIVED):
        assert st.next_status(cur, "client_cancel") == st.CANCELLED, cur
    try:
        st.next_status(st.IN_PROGRESS, "client_cancel")
        raise AssertionError("отмена во время поездки должна быть запрещена")
    except ValueError:
        pass


def test_chain():
    """Цепочка: бронь → активация → снятие брони при отказе."""
    s = st.next_status(st.CREATED, "reserve_chain")
    assert s == st.CHAIN_RESERVED, s
    assert st.next_status(s, "activate_chain") == st.ASSIGNED
    assert st.next_status(s, "release_chain") == st.CREATED


def test_constants_match_release_plan():
    """Параметры релиза: принятие 8 секунд, бесплатное ожидание 2 минуты."""
    assert st.ASSIGNED_ACCEPT_SECONDS == 8
    assert pricing.FREE_WAITING_MINUTES == 2
    assert st.ARRIVED in st.ACTIVE_STATUSES
    assert st.CREATED in st.CLIENT_ACTIVE_STATUSES


def test_rub_no_kopecks():
    """Копеек нет: половина рубля округляется вверх."""
    assert pricing.rub(10) == 10
    assert pricing.rub(10.4) == 10
    assert pricing.rub(10.5) == 11
    assert pricing.rub(10.99) == 11
    assert pricing.rub("15") == 15
    assert pricing.rub(None) == 0
    assert isinstance(pricing.rub(99.999), int)


def test_waiting_two_minutes_free():
    """Первые 2 минуты ожидания бесплатны, дальше 15 ₽/мин (лимит 10 платных)."""
    assert pricing.calc_waiting(0) == 0
    assert pricing.calc_waiting(1) == 0
    assert pricing.calc_waiting(2) == 0
    assert pricing.calc_waiting(3) == 15
    assert pricing.calc_waiting(4) == 30
    assert pricing.calc_waiting(60) == 10 * 15  # потолок платных минут


def test_commission_whole_rubles():
    """Комиссия — целые рубли, с баланса списывается она."""
    assert pricing.commission(1000, 15) == 150
    assert pricing.commission(333, 15) == 50      # 49.95 → 50
    assert pricing.commission(777, 10) == 78      # 77.7 → 78
    assert isinstance(pricing.commission(1001, 15), int)
    # Выручка не начисляется: комиссия всегда меньше суммы заказа
    assert pricing.commission(100, 15) < 100


def test_price_rounding():
    """Тарифы возвращают целые рубли."""
    class Tariff:
        base_price = 200
        included_km = 2
        city_per_km = 25
        out_city_per_km = 30
        coefficient = 1.0
        min_price = 500
        per_km = 7.3

    total = pricing.calc_standard(5.6, 1.2, 0, Tariff, 0, False, 0, 0)
    assert isinstance(total, int) and total > 0
    intercity = pricing.calc_intercity(33.3, Tariff, 1, False, 0, 0)
    assert isinstance(intercity, int) and intercity >= 500


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"OK   {name}")
            except Exception as e:  # noqa: BLE001
                failed += 1
                print(f"FAIL {name}: {e!r}")
    print("FAILURES:", failed)
    sys.exit(1 if failed else 0)
