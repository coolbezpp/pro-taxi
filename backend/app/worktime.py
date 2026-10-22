"""Контроль рабочего времени исполнителя.

Правила:
* лимит — 12 часов непрерывной работы, отсчёт идёт от первого принятого заказа;
* за 2 часа до лимита исполнитель получает предупреждение;
* при достижении лимита новые заказы не поступают;
* после смены — обязательный отдых 6 часов, до его конца работать нельзя.
"""

from datetime import datetime, timedelta

from .models import ExecutorWorkSession

WORK_LIMIT_MINUTES = 12 * 60
WARNING_BEFORE_MINUTES = 2 * 60
REST_MINUTES = 6 * 60
# Если исполнитель ничего не делает дольше этого времени, смена считается завершённой.
IDLE_MINUTES = 30

STATUS_OK = "ok"
STATUS_WARNING = "warning"
STATUS_BLOCKED = "blocked"
STATUS_RESTING = "resting"


def _now() -> datetime:
    return datetime.utcnow()


def _open_session(db, executor_id: int):
    return (
        db.query(ExecutorWorkSession)
        .filter(
            ExecutorWorkSession.executor_id == executor_id,
            ExecutorWorkSession.ended_at.is_(None),
        )
        .order_by(ExecutorWorkSession.id.desc())
        .first()
    )


def _last_session(db, executor_id: int):
    return (
        db.query(ExecutorWorkSession)
        .filter(ExecutorWorkSession.executor_id == executor_id)
        .order_by(ExecutorWorkSession.id.desc())
        .first()
    )


def close_idle_session(db, executor_id: int):
    """Закрывает смену, если исполнитель давно не брал заказы."""
    session = _open_session(db, executor_id)
    if not session:
        return None

    idle_since = session.last_activity_at or session.started_at
    if _now() - idle_since < timedelta(minutes=IDLE_MINUTES):
        return session

    session.ended_at = idle_since
    db.commit()
    return session


def work_state(db, executor_id: int) -> dict:
    """Текущее состояние рабочего времени исполнителя."""
    now = _now()
    close_idle_session(db, executor_id)

    session = _open_session(db, executor_id)
    if session:
        worked = max(0, int((now - session.started_at).total_seconds() // 60))
        remaining = max(0, WORK_LIMIT_MINUTES - worked)
        if remaining <= 0:
            status = STATUS_BLOCKED
        elif remaining <= WARNING_BEFORE_MINUTES:
            status = STATUS_WARNING
        else:
            status = STATUS_OK
        return {
            "status": status,
            "started_at": session.started_at.isoformat(),
            "worked_minutes": worked,
            "limit_minutes": WORK_LIMIT_MINUTES,
            "remaining_minutes": remaining,
            "rest_minutes": REST_MINUTES,
            "rest_until": None,
            "can_accept_orders": status != STATUS_BLOCKED,
        }

    last = _last_session(db, executor_id)
    if last and last.ended_at:
        rest_until = last.ended_at + timedelta(minutes=REST_MINUTES)
        rest_left = int((rest_until - now).total_seconds() // 60)
        if rest_left > 0:
            return {
                "status": STATUS_RESTING,
                "started_at": last.started_at.isoformat(),
                "worked_minutes": int(
                    ((last.ended_at - last.started_at).total_seconds() // 60)
                ),
                "limit_minutes": WORK_LIMIT_MINUTES,
                "remaining_minutes": 0,
                "rest_minutes": REST_MINUTES,
                "rest_until": rest_until.isoformat(),
                "can_accept_orders": False,
            }
        worked_last = int(((last.ended_at - last.started_at).total_seconds() // 60))
        return {
            "status": STATUS_OK,
            "started_at": None,
            "worked_minutes": 0,
            "limit_minutes": WORK_LIMIT_MINUTES,
            "remaining_minutes": WORK_LIMIT_MINUTES,
            "rest_minutes": REST_MINUTES,
            "rest_until": None,
            "last_session_minutes": worked_last,
            "can_accept_orders": True,
        }

    return {
        "status": STATUS_OK,
        "started_at": None,
        "worked_minutes": 0,
        "limit_minutes": WORK_LIMIT_MINUTES,
        "remaining_minutes": WORK_LIMIT_MINUTES,
        "rest_minutes": REST_MINUTES,
        "rest_until": None,
        "can_accept_orders": True,
    }


def start_session(db, executor_id: int) -> dict:
    """Открывает смену при принятии первого заказа."""
    state = work_state(db, executor_id)
    if state["status"] == STATUS_BLOCKED:
        return state
    if state["status"] == STATUS_RESTING:
        return state

    session = _open_session(db, executor_id)
    now = _now()
    if not session:
        session = ExecutorWorkSession(
            executor_id=executor_id,
            started_at=now,
            last_activity_at=now,
        )
        db.add(session)
    else:
        session.last_activity_at = now
    db.commit()
    return work_state(db, executor_id)


def touch_session(db, executor_id: int) -> None:
    """Продлевает активность смены (принят/начат/завершён заказ)."""
    session = _open_session(db, executor_id)
    if session:
        session.last_activity_at = _now()
        db.commit()


def stop_session(db, executor_id: int) -> dict:
    """Завершает смену: дальше — отдых 6 часов."""
    session = _open_session(db, executor_id)
    now = _now()
    if session:
        session.ended_at = now
        session.last_activity_at = now
        db.commit()
    return work_state(db, executor_id)


def should_warn(db, executor_id: int) -> bool:
    """True, если пора предупредить о скорой блокировке (и ещё не предупреждали)."""
    session = _open_session(db, executor_id)
    if not session or session.warned_at:
        return False
    worked = (_now() - session.started_at).total_seconds() / 60
    return WORK_LIMIT_MINUTES - worked <= WARNING_BEFORE_MINUTES


def mark_warned(db, executor_id: int) -> None:
    session = _open_session(db, executor_id)
    if session and not session.warned_at:
        session.warned_at = _now()
        db.commit()
