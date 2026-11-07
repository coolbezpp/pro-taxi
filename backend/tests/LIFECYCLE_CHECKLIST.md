# Чек-лист жизненного цикла заказа (ручной прогон, 11 шагов)

Сценарий прогоняется вручную через Swagger UI бэкенда и сверяется со статусом
заказа и списком событий `order_events`. Боевую БД не трогаем: шаги выполняются
только на тестовом/локальном окружении (`docker compose up` + `http://localhost:8000`).

Автотест к этому сценарию: `backend/tests/test_lifecycle_api.py`
(запускается только при заданной `TEST_DATABASE_URL`).

---

## 0. Подготовка

### Где открывать Swagger

- API поднимается на порту `8000`, который опубликован только на localhost
  (`docker-compose.yml`: `127.0.0.1:8000:8000`). Swagger UI: **`http://localhost:8000/docs`**
  (стандартный `docs_url` у `FastAPI(title="Pro API")`, см. `backend/app/main.py`).
- На боевом домене `procityservice.ru` Caddy проксирует только `/api/*`
  (см. `Caddyfile`), поэтому `https://procityservice.ru/api/docs` → 404,
  а `/docs` вообще не обрабатывается. Формулировка ТЗ «через /api/docs»
  расходится с кодом — фактически Swagger доступен по `/docs` на порту 8000
  (локально или по SSH-туннелю `ssh -L 8000:127.0.0.1:8000 ...`).

### Токены и куки

| Кто | Как получить | Что передаём |
|---|---|---|
| Клиент | `POST /api/auth/max`, тело `{"max_user_id":"...","phone":"+7...","role":"client"}` | заголовок `Authorization: Bearer <token>` |
| Исполнитель | `POST /api/executors/auth` с `initData` из MINI APP MAX (проще — открыть миниапп исполнителя, в DevTools → Network скопировать токен из ответа авторизации) | `Authorization: Bearer <token>` (в JWT `sub` = `executors.id`) |
| Админ | `POST /api/admin/login`, тело `{"password":"..."}` | **кука** `admin_session` (httponly, secure) |
| Оператор | `POST /api/admin/operator/login`, тело `{"login":"...","password":"..."}` | **кука** `operator_session` |

Куки `secure`, поэтому в curl по `http://localhost` их удобнее передавать явно:

```bash
# логин админа → достаём значение куки из jar и используем заголовком
curl -s -c admin.txt -X POST http://localhost:8000/api/admin/login \
  -H "Content-Type: application/json" -d '{"password":"<ADMIN_PASSWORD>"}'
SESSION=$(awk '$6=="admin_session" {print $7}' admin.txt)
COOK="Cookie: admin_session=$SESSION"
```

Сокращения запросов ниже:

```bash
A="Authorization: Bearer $CLIENT_TOKEN"     # клиент
E="Authorization: Bearer $EXECUTOR_TOKEN"   # исполнитель
E2="Authorization: Bearer $EXECUTOR2_TOKEN" # второй исполнитель
CT="Content-Type: application/json"
```

События заказа (для всех шагов): `GET /api/admin/orders/{id}/events` с `$COOK`
либо напрямую в БД:

```sql
SELECT event, payload, created_at FROM order_events WHERE order_id = <ID> ORDER BY id;
```

---

## 1. Клиент создаёт заказ → `created`

```bash
curl -s -X POST http://localhost:8000/api/orders \
  -H "$A" -H "$CT" -d '{
    "client_id": 1,
    "service": "taxi",
    "tariff_code": "standard",
    "from_address": "Краснодар, ул. Красная, 1",
    "to_address": "Краснодар, ул. Северная, 100",
    "from_lat": 45.035, "from_lon": 38.975,
    "to_lat": 45.045, "to_lon": 38.985,
    "distance_km": 5.4
  }'
```

**Ожидается:**
- `status = created`, поле `share_code` заполнено;
- владелец заказа определяется **по токену**, поле `client_id` в теле —
  техническое;
- в `order_events` строка `event = created` (payload содержит `total`);
- `GET /api/orders/{id}` с клиентским токеном возвращает `status = created`.

**Отрицательные проверки:** без тарифа `standard` (или при `active=false`) →
`400 tariff unavailable`; неизвестная услуга → `400`; заблокированный клиент →
`403`.

---

## 2. Исполнитель берёт заказ из ленты → `accepted`

```bash
curl -s -X POST "http://localhost:8000/api/orders/$ID/assign/$EXECUTOR_ID" -H "$E"
```

**Ожидается:**
- `status = accepted`;
- событие `accepted` (`payload.actor = executor`, `executor_id` = исполнитель);
- клиенту ушло уведомление «Исполнитель принял заказ».

**Отрицательные проверки:** исполнитель со статусом не `approved` → `403`;
без роли `driver` в `executor_roles` → `403`; у исполнителя уже есть активный
заказ → `409`; повторный `take` по занятому заказу → `409`.

---

## 3. Приехал → `arrived`, старт → `in_progress`, ожидание платное после 2 мин

```bash
curl -s -X POST "http://localhost:8000/api/orders/$ID/arrived" -H "$E"
curl -s -X POST "http://localhost:8000/api/orders/$ID/start"   -H "$E"
```

(альтернатива `arrived` — `POST /api/orders/{id}/arrive` из `order_chain`,
переход один и тот же: `accepted → arrived`; `start` возможен **только** из `arrived`).

**Ожидается:**
- после `arrived` — `status = arrived`, событие `arrived`;
- после `start` — `status = in_progress`, событие `started`;
- платное ожидание считается от события `arrived`: 2 минуты бесплатно
  (`FREE_WAITING_MINUTES = 2`), далее 15 ₽/мин, максимум 10 платных минут
  (`pricing.py`);
- `waiting_price` фиксируется при завершении заказа (`order_flow.apply_waiting`)
  либо вручную оператором: `POST /api/orders/{id}/waiting?minutes=3` (кука
  персонала) → `waiting_price = 45`, `total_price` пересчитан.

> Проверить `waiting_price > 0` можно после `complete` (шаг 4) или вызвав
> `/waiting` до завершения.

---

## 4. Завершение → `completed`, ровно одно удержание комиссии

```bash
curl -s -X POST "http://localhost:8000/api/orders/$ID/complete" -H "$E"
```

**Ожидается:**
- `status = completed`;
- события: `completed` (payload содержит `commission`);
- в балансе исполнителя **одна** операция `ExecutorBalanceOp` по этому заказу
  типа `commission` (минус комиссия; по продукту удержание с баланса
  исполнителя, `COMMISSION_PERCENT`, по умолчанию 15%);
- клиенту и исполнителю ушли сообщения MAX (при настроенных токенах ботов).

---

## 5. Повторный `complete` → `409`, второго удержания нет

```bash
curl -s -i -X POST "http://localhost:8000/api/orders/$ID/complete" -H "$E"
```

**Ожидается:**
- `409 Conflict`, detail «Заказ уже завершён»;
- количество операций баланса по `order_id` не изменилось (защита в
  `charge_commission` — повторный вызов возвращает `0`).

---

## 6. Чужой исполнитель трогает заказ → `403`

```bash
curl -s -i -X POST "http://localhost:8000/api/orders/$ID/complete" -H "$E2"
```

**Ожидается:** `403` («Это не ваш заказ»), статус и события не меняются.
То же для `arrived`, `start`, `executor-cancel`.

---

## 7. Без токена на команды исполнителя → `401/403`

```bash
curl -s -i -X POST "http://localhost:8000/api/orders/$ID/accept"
curl -s -i -X POST "http://localhost:8000/api/orders/$ID/arrived"
curl -s -i -X POST "http://localhost:8000/api/orders/$ID/start"
curl -s -i -X POST "http://localhost:8000/api/orders/$ID/complete"
curl -s -i -X POST "http://localhost:8000/api/orders/$ID/cancel" -H "$CT" -d '{"reason":"x"}'
```

**Ожидается:** `401 Unauthorized` (нет Bearer) либо `403` (роль не исполнитель);
заказ и балансы не меняются. `GET /api/orders/{id}` без токена → `401`.

---

## 8. Оператор назначает → `assigned`; через 60 с без ответа → снова `created`

Новый заказ `$ID2` (шаг 1), затем с кукой персонала:

```bash
curl -s -X POST "http://localhost:8000/api/orders/$ID2/assign/$EXECUTOR_ID" -H "$COOK"
```

**Ожидается:**
- `status = assigned`, событие `assigned` с `payload.actor = "staff"`;
- у исполнителя в ленте появился заказ с отсчётом.

Далее **60 секунд не отвечать** (`ASSIGNED_ACCEPT_SECONDS = 60`; фоновый
`_order_timeout_watcher` в `main.py` ходит каждые 2 секунды):

```bash
sleep 65
```

**Ожидается:**
- `status = created` (заказ вернулся в общий пул);
- событие `declined` с `payload.reason = "timeout"`;
- у исполнителя `skip_streak += 1` и сообщение в MAX «Заказ №… снова в общем
  пуле: не взят за 60 секунд».

---

## 9. Исполнитель отказывается с причиной → `created`, причина в событии

```bash
# доводим до arrived: take из ленты, затем «на месте»
curl -s -X POST "http://localhost:8000/api/orders/$ID2/assign/$EXECUTOR_ID" -H "$E"
curl -s -X POST "http://localhost:8000/api/orders/$ID2/arrived" -H "$E"
curl -s -X POST "http://localhost:8000/api/orders/$ID2/executor-cancel" \
  -H "$E" -H "$CT" -d '{"reason":"Клиент передумал"}'
```

**Ожидается:**
- переход `accepted|arrived → created` (см. `order_states.TRANSITIONS`);
- событие `executor_cancelled` с `payload.reason = "Клиент передумал"`;
- `skip_streak += 1` у исполнителя;
- без `reason` → `422` (`reason` обязателен, `ExecutorCancelIn`).

---

## 10. Предзаказ на завтра через 6 минут остаётся `created`

```bash
# scheduled_at — завтра, 09:00 (местное время, ISO)
curl -s -X POST http://localhost:8000/api/orders -H "$A" -H "$CT" -d '{
  "client_id": 1, "service": "taxi", "tariff_code": "standard",
  "from_address": "Краснодар, ул. Красная, 1",
  "to_address": "Краснодар, аэропорт",
  "from_lat": 45.035, "from_lon": 38.975,
  "to_lat": 45.03, "to_lon": 39.13,
  "distance_km": 18.0,
  "scheduled_at": "2026-11-08T09:00"
}'
sleep 360
curl -s "http://localhost:8000/api/orders/$PREORDER_ID" -H "$A" | jq -r .status
```

**Ожидается:**
- статус по-прежнему `created`, событий `cancelled`/`timeout` нет —
  watcher пропускает заказы с `scheduled_at` в будущем;
- контрольная проверка «другой стороны»: заказ **без** `scheduled_at` и без
  исполнителя, прождавший `ORDER_STALE_MINUTES = 5`, отменяется фоном:
  событие `timeout` с `payload.reason = "не взят заказ 5 минут"`,
  `status = cancelled`, клиенту уходит сообщение MAX.

---

## 11. Клиент отменяет с причиной → `cancelled`, причина видна в заказе

```bash
curl -s -X POST "http://localhost:8000/api/orders/$PREORDER_ID/cancel" \
  -H "$A" -H "$CT" -d '{"reason":"Долго ждать"}'
curl -s "http://localhost:8000/api/orders/$PREORDER_ID" -H "$A" | jq -r .cancel_reason
```

**Ожидается:**
- ответ отмены `{"ok": true, "status": "cancelled"}`;
- `GET /api/orders/{id}` → `cancel_reason = "Долго ждать"`;
- событие `cancelled` (действие `client_cancel`) с `payload.reason`;
- отмена доступна только из `created / chain_reserved / assigned / accepted /
  arrived` (из `in_progress` → `400`), повторная отмена идемпотентна;
- исполнителю (если был назначен) ушло уведомление «Клиент отменил заказ».

---

## Сводная таблица ожиданий

| Шаг | status после | событие в `order_events` |
|-----|--------------|--------------------------|
| 1 | `created` | `created` |
| 2 | `accepted` | `accepted` |
| 3 | `arrived` → `in_progress` | `arrived`, `started` |
| 4 | `completed` | `completed` + операция баланса `commission` |
| 5 | `completed` (409) | — |
| 6 | `completed` (403) | — |
| 7 | без изменений (401/403) | — |
| 8 | `assigned` → `created` | `assigned`, `declined` (`reason=timeout`) |
| 9 | `created` | `executor_cancelled` (`reason=…`) |
| 10 | `created` | — (для предзаказа); для просроченного — `timeout` |
| 11 | `cancelled` | `cancelled` (`reason=…`) |
