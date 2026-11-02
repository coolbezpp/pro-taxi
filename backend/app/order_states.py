"""Статусы заказа и разрешённые переходы — единый источник правды.

Модуль без зависимостей от приложения: его проверяют юнит-тесты без БД.
"""

CREATED = "created"
CHAIN_RESERVED = "chain_reserved"
ASSIGNED = "assigned"
ACCEPTED = "accepted"
ARRIVED = "arrived"
IN_PROGRESS = "in_progress"
COMPLETED = "completed"
CANCELLED = "cancelled"

# Заказ «на исполнителе»: исполнитель есть, заказ ещё не закрыт
ACTIVE_STATUSES = (ASSIGNED, ACCEPTED, ARRIVED, IN_PROGRESS)
# Активный для клиента: ищем исполнителя или уже выполняем
CLIENT_ACTIVE_STATUSES = (CREATED, CHAIN_RESERVED) + ACTIVE_STATUSES

# Время исполнителю на принятие заказа (и в ленте, и назначенного оператором)
ASSIGNED_ACCEPT_SECONDS = 8
# Заказ без исполнителя закрывается через столько минут ожидания
ORDER_STALE_MINUTES = 5

# действие -> (статусы, из которых можно, новый статус)
TRANSITIONS = {
    "take": ({CREATED}, ACCEPTED),                    # исполнитель взял из ленты
    "assign": ({CREATED}, ASSIGNED),                  # назначил оператор
    "accept": ({ASSIGNED}, ACCEPTED),
    "decline": ({ASSIGNED}, CREATED),                 # отказ или таймаут принятия
    "arrive": ({ACCEPTED}, ARRIVED),
    "start": ({ARRIVED}, IN_PROGRESS),
    "complete": ({IN_PROGRESS}, COMPLETED),
    "executor_cancel": ({ACCEPTED, ARRIVED}, CREATED),  # заказ возвращается в ленту
    "client_cancel": ({CREATED, CHAIN_RESERVED, ASSIGNED, ACCEPTED, ARRIVED}, CANCELLED),
    "staff_cancel": (
        {CREATED, CHAIN_RESERVED, ASSIGNED, ACCEPTED, ARRIVED, IN_PROGRESS},
        CANCELLED,
    ),
    "timeout": ({CREATED}, CANCELLED),
    "reserve_chain": ({CREATED}, CHAIN_RESERVED),
    "activate_chain": ({CHAIN_RESERVED}, ASSIGNED),
    "release_chain": ({CHAIN_RESERVED}, CREATED),
}

STATUS_RU = {
    CREATED: "Создан",
    CHAIN_RESERVED: "Забронирован в цепочке",
    ASSIGNED: "Назначен",
    ACCEPTED: "Принят",
    ARRIVED: "Исполнитель на месте",
    IN_PROGRESS: "Выполняется",
    COMPLETED: "Завершён",
    CANCELLED: "Отменён",
}

ACTION_RU = {
    "take": "Взять заказ",
    "assign": "Назначить исполнителя",
    "accept": "Принять заказ",
    "decline": "Отказаться от заказа",
    "arrive": "Я на месте",
    "start": "Начать поездку",
    "complete": "Завершить заказ",
    "executor_cancel": "Отказаться от заказа",
    "client_cancel": "Отменить заказ",
    "staff_cancel": "Отменить заказ",
    "timeout": "Закрыть по таймауту",
    "reserve_chain": "Забронировать следующим",
    "activate_chain": "Активировать цепочку",
    "release_chain": "Снять бронь цепочки",
}


def next_status(current: str, action: str) -> str:
    """Новый статус после действия или ValueError с понятным текстом."""
    if action not in TRANSITIONS:
        raise ValueError(f"Неизвестное действие: {action}")
    allowed, target = TRANSITIONS[action]
    if current not in allowed:
        raise ValueError(
            f"Нельзя «{ACTION_RU[action]}» в статусе «{STATUS_RU.get(current, current)}»"
        )
    return target
