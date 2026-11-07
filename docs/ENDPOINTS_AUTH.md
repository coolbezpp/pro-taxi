# Эндпоинты Pro API и модель доступа

- Дата формирования: 07.11.2026.
- Сгенерировано по коду, код не менялся (файл создан только для документации).
- Схема соответствует состоянию репозитория: `pro/backend/app/main.py` + `pro/backend/app/routers/*.py`.
- Пути указаны реальные, с префиксами из `include_router` / `APIRouter(prefix=...)`.

## Как читать таблицы

| Обозначение | Что значит |
|---|---|
| `get_current_user` | JWT в `Authorization: Bearer` — любой вошедший пользователь (в основном клиент). |
| `исполнитель (Bearer)` | `get_current_executor` или ручной `bearer_scheme` + `get_current_executor` — только исполнитель; часто со сверкой `executor_id` с токеном и `sid` (одна живая сессия). |
| `участник заказа (Bearer)` | Токен клиента **или** исполнителя, дополнительно проверяется привязка к заказу (`_participant` / `_require_participant`). |
| `get_executor_or_staff` | Исполнитель по Bearer **или** сотрудник по cookie (`admin_session` / `operator_session`). |
| `get_staff` | Cookie администратора **или** оператора (оператор/админ). |
| `get_admin` | Только cookie администратора. |
| `нет (public)` | Авторизации нет вообще — доступно без токена и cookie. |
| `частично` | Авторизация есть, но обходится (см. комментарий/риск). |

Общие замечания по коду:

- CORS включён с `allow_origins=["*"]` (методы и заголовки — любые).
- Админка и оператор работают на **cookie-сессиях**, живущих в памяти процесса (12 ч), токены пользователей/исполнителей — JWT HS256 (`jwt_secret`).
- Глобального middleware авторизации нет: доступ определяется только `Depends` на конкретном маршруте.

---

## 1. Служебные и публичные данные

| Метод | Путь | Авторизация | Риск (только для «нет»/public) | Комментарий |
|---|---|---|---|---|
| GET | `/api/health` | нет (public) | — | Статус сервиса. |
| GET | `/api/stats/popular-services` | нет (public) | низкий: агрегированная статистика спроса по услугам, без ПДн | Окно `days` 1–365. |
| GET | `/api/tariffs` | нет (public) | низкий: коммерческие тарифы и цены | Только активные тарифы. |
| POST | `/api/price` | нет (public) | низкий: расчёт стоимости по тарифу, ПДн нет | Тело: tariff_code, distance_km и т.п. |
| GET | `/api/settlements/intercity` | нет (public) | низкий: тарифы межгорода | `Settlement.intercity_allowed=True`. |

## 2. Вход и аутентификация

| Метод | Путь | Авторизация | Риск (только для «нет»/public) | Комментарий |
|---|---|---|---|---|
| POST | `/api/auth/max` | нет (public) | **высокий**: принимает произвольные `max_user_id` и `phone` **без проверки подписи** и выдаёт JWT — можно создать/занять аккаунт под чужим `max_user_id` (имперсонация) | Нет rate-limit, нет подписи init_data. |
| POST | `/api/auth/max/miniapp` | нет (public) | средний: только с валидной подписью `init_data` (HMAC бота) и подтверждённым контактом | Создаёт/обновляет User и Client, выдаёт JWT. |
| POST | `/api/clients/auth` | нет (public) | **высокий**: `initData` парсится как JSON **без проверки подписи** — можно зарегистрировать клиента и «войти» под любым `max_id` | Возвращает профиль клиента без токена. |
| POST | `/api/executors/auth` | нет (public) | средний: требуется подпись `initData` + существующий профиль с подтверждённым телефоном | Открывает новую сессию (sid), выдаёт токен исполнителя. |
| POST | `/api/executors/auth/contact` | нет (public) | средний: подпись `initData` + подтверждённый контакт; создаёт профиль исполнителя со статусом `pending` | Первичная регистрация исполнителя. |
| POST | `/api/admin/login` | нет (public) | средний: перебор пароля админа (ограничен: 5 попыток / 5 мин по IP), выдаёт `admin_session` cookie | Пароль из `ADMIN_PASSWORD`. |
| POST | `/api/admin/logout` | нет (public) | — | Инвалидирует cookie сессии. |
| POST | `/api/admin/operator/login` | нет (public) | средний: перебор логина/пароля оператора (5/5 мин по IP), выдаёт `operator_session` cookie | bcrypt-хэш в БД. |
| POST | `/api/admin/operator/logout` | нет (public) | — | Инвалидирует cookie. |

## 3. Заказы клиента (авторизованы)

| Метод | Путь | Авторизация | Риск (только для «нет»/public) | Комментарий |
|---|---|---|---|---|
| POST | `/api/orders` | get_current_user | — | Создание заказа, расчёт цены на сервере. |
| GET | `/api/me/orders` | get_current_user | — | Мои заказы. |
| GET | `/api/orders/{order_id}` | get_current_user + проверка участника | — | Карточка заказа (`_require_order_participant`). |
| POST | `/api/orders/{order_id}/favorite` | get_current_user | — | Только свои заказы (`_client_order`). |
| PUT | `/api/orders/{order_id}/favorite-title` | get_current_user | — | Своё название избранного. |
| GET | `/api/me/support` | get_current_user | — | Чат с поддержкой (оператором). |
| POST | `/api/me/support` | get_current_user | — | Сообщение в поддержку. |
| GET | `/api/me/summary` | get_current_user | — | Сводка клиента (профиль, баланс, уведомления). |
| POST | `/api/orders/{order_id}/cancel` | get_current_user | — | Отмена **своего** заказа. |
| POST | `/api/orders/{order_id}/increase` | get_current_user | — | +50 ₽ к цене своего заказа, пока статус `created`. |
| POST | `/api/masters/orders` | get_current_user | — | Заказ услуги мастера. |
| GET | `/api/geo/map-proxy/{resource:path}` | get_current_user | — | Прокси тайлов карты для авторизованных. |
| GET | `/api/orders/{order_id}/share/{share_code}` | нет (public) | данные заказа по share-коду: адреса «откуда/куда», статус, время; без цен и ПДн; риск перебора `share_code` | Сводка из «Поделиться». |

## 4. Лента заказов без авторизации

| Метод | Путь | Авторизация | Риск (только для «нет»/public) | Комментарий |
|---|---|---|---|---|
| GET | `/api/available-orders` | нет (public) | **высокий**: по query `executor_id` и `role` отдаётся **весь пул открытых заказов** — адреса подачи/назначения, цены, мета-данные, время; токен не требуется | Нет проверки ни токена, ни того, что `executor_id` принадлежит вызывающему. |
| GET | `/api/orders/available` | нет (public) | **высокий**: то же самое (второй путь той же функции) | legacy-URL. |

## 5. Оценки и «потерянная вещь»

| Метод | Путь | Авторизация | Риск (только для «нет»/public) | Комментарий |
|---|---|---|---|---|
| POST | `/api/ratings` | частично: клиент — Bearer; исполнитель — **`executor_id` в теле без токена** | средний/высокий: без токена можно поставить оценку от имени исполнителя, зная `order_id` и `executor_id` (проверяется только `order.executor_id == executor_id`) | Окно оценки — 1 час после завершения. |
| POST | `/api/orders/{order_id}/lost-item` | Bearer клиента (ручная проверка `_optional_user`, не через `Depends`) | — | Кнопка «оставил вещи», только для своего завершённого заказа такси. |

## 6. Лента, назначение и жизненный цикл заказа

| Метод | Путь | Авторизация | Риск (только для «нет»/public) | Комментарий |
|---|---|---|---|---|
| POST | `/api/orders/{order_id}/assign/{executor_id}` | get_executor_or_staff | — | Исполнитель берёт из ленты или оператор назначает. |
| POST | `/api/orders/{order_id}/activate-chain/{executor_id}` | get_executor_or_staff | — | Ручная активация следующего заказа цепочки. |
| POST | `/api/orders/{order_id}/complete` | get_executor_or_staff | — | Завершение заказа (деньги/итог). |
| POST | `/api/orders/{order_id}/waiting` | get_staff | — | Ручная корректировка ожидания и цены оператором. |
| GET | `/api/executor/available-orders` | get_current_user + привязка `Executor.max_id` | — | Лента исполнителя по пользовательскому токену (403, если не исполнитель). |
| POST | `/api/orders/{order_id}/arrived` | исполнитель (Bearer → `get_current_executor`) | — | «Приехал на точку», старт бесплатного ожидания. |
| POST | `/api/orders/{order_id}/decline` | исполнитель (Bearer) | — | Отказ от назначенного заказа. |
| POST | `/api/orders/{order_id}/executor-cancel` | исполнитель (Bearer) | — | Отказ от принятого заказа, возврат в ленту. |
| GET | `/api/orders/{order_id}/chain` | исполнитель (Bearer, сверка с заказом) | — | Кандидаты цепочки. |
| POST | `/api/orders/{order_id}/chain/{next_order_id}/reserve` | исполнитель (Bearer, сверка с заказом) | — | Бронь следующего заказа цепочки. |
| POST | `/api/orders/{order_id}/accept` | исполнитель (Bearer, сверка с заказом) | — | Подтверждение выезда; проверяется отстранение. |
| POST | `/api/orders/{order_id}/arrive` | исполнитель (Bearer, сверка с заказом) | — | Прибытие (order_chain). |
| POST | `/api/orders/{order_id}/start` | исполнитель (Bearer, сверка с заказом) | — | Начало поездки + расчёт ожидания. |
| GET | `/api/orders/executor/{executor_id}` | исполнитель (Bearer, `executor.id == executor_id`) | — | Последние 100 заказов исполнителя. |
| GET | `/api/orders/driver/{executor_id}` | исполнитель (Bearer, сверка id) | — | legacy-URL старого миниаппа. |

## 7. Чат заказа, трекинг и геопозиция

| Метод | Путь | Авторизация | Риск (только для «нет»/public) | Комментарий |
|---|---|---|---|---|
| GET | `/api/orders/{order_id}/track` | участник заказа (Bearer) | — | Статус, исполнитель, его позиция (приватность позиции для клиента — по правилам сервиса). |
| GET | `/api/orders/{order_id}/messages` | участник заказа (Bearer) | — | До 200 сообщений чата. |
| POST | `/api/orders/{order_id}/messages` | участник заказа (Bearer) | — | Автор определяется токеном. |
| GET | `/api/messages` | исполнитель (Bearer) | — | Диалог исполнителя с оператором. |
| POST | `/api/messages` | исполнитель (Bearer) | — | Сообщение от исполнителя оператору. |
| POST | `/api/executors/{executor_id}/position` | исполнитель (Bearer, сверка id + sid) | — | Запись геопозиции (виден клиенту в трекинге). |
| POST | `/api/executor/tracking-code` | исполнитель (Bearer, сверка sid) | — | Одноразовый 8-символьный код на 10 минут для страницы трекинга. |
| POST | `/api/track/session` | нет (public) | обмен одноразового кода на 7-дневный токен исполнителя: при утечке/подборе кода — доступ к профилю и позиции; код одноразовый, TTL 10 мин | Брутфорс-потенциал ограничен алфавитом и TTL. |
| POST | `/api/max/geo-request` | исполнитель (Bearer, сверка sid) | — | Просит бота отправить кнопку «поделиться геопозицией». |

## 8. Допуслуги заказа

| Метод | Путь | Авторизация | Риск (только для «нет»/public) | Комментарий |
|---|---|---|---|---|
| POST | `/api/orders/{order_id}/extras` | исполнитель заказа (Bearer, сверка `order.executor_id`) | — | Предложение допуслуги (только в активном заказе). |
| GET | `/api/orders/{order_id}/extras` | участник заказа (клиент или исполнитель) | — | Список допуслуг. |
| PUT | `/api/extras/{extra_id}/decision` | участник заказа (клиент или исполнитель) | — | `approved` **увеличивает `total_price` заказа** — деньги. |

## 9. Уведомления

| Метод | Путь | Авторизация | Риск (только для «нет»/public) | Комментарий |
|---|---|---|---|---|
| GET | `/api/notifications?max_id=` | нет (public) | **высокий**: чтение чужих уведомлений по произвольному `max_id` — тексты, темы, `order_id`, статус прочтения (косвенно — персональные данные и активность) | Нет ни токена, ни сверки владельца. |
| PUT | `/api/notifications/{notification_id}/read` | нет (public) | средний: пометить чужое уведомление прочитанным (подделка состояния) | Нет проверки владельца. |
| GET | `/api/executors/{executor_id}/notifications` | исполнитель (Bearer) | — | Последние 50 уведомлений. |
| PUT | `/api/executors/{executor_id}/notifications/{notification_id}/read` | исполнитель (Bearer) | — | Прочитано. |
| PUT | `/api/executors/{executor_id}/notifications/read-all` | исполнитель (Bearer) | — | Прочитать все. |
| POST | `/api/executors/{executor_id}/notifications` | get_admin | — | Отправка уведомления исполнителю. |

## 10. Профиль, финансы и режим исполнителя

Все маршруты ниже: `исполнитель (Bearer)` — `get_current_executor` + сверка `executor_id` с токеном (`_require_same`), для части ещё и `sid` (одна живая сессия).

| Метод | Путь | Авторизация | Риск (только для «нет»/public) | Комментарий |
|---|---|---|---|---|
| GET | `/api/executors/{executor_id}` | исполнитель (Bearer) | — | Профиль: телефон, баланс, рейтинг, позиция. |
| GET | `/api/executors/{executor_id}/balance-history` | исполнитель (Bearer) | — | История баланса/заработка. |
| POST | `/api/executors/{executor_id}/online` | исполнитель (Bearer) | — | Выход на линию / оффлайн (учитывает отстранение). |
| POST | `/api/orders/{order_id}/skip` | исполнитель (Bearer) | — | Пропуск заказа из ленты. |
| GET | `/api/executors/{executor_id}/work-time` | исполнитель (Bearer) | — | Рабочее время и лимиты. |
| POST | `/api/executors/{executor_id}/work-session/stop` | исполнитель (Bearer) | — | Остановка рабочей сессии. |
| GET | `/api/executors/{executor_id}/photo-checks` | исполнитель (Bearer) | — | Свои фото-проверки. |
| POST | `/api/executors/{executor_id}/photo-checks` | исполнитель (Bearer) | — | Загрузка селфи на проверку. |
| PUT | `/api/executors/{executor_id}/photo-checks/{check_id}` | исполнитель (Bearer) | — | Обновление фото-проверки. |
| GET | `/api/executors/{executor_id}/vehicle` | исполнитель (Bearer) | — | Транспорт. |
| PUT | `/api/executors/{executor_id}/vehicle/mileage` | исполнитель (Bearer) | — | Пробег (для ТО). |
| POST | `/api/executors/{executor_id}/maintenance` | исполнитель (Bearer) | — | Запись расходов на ТО. |
| DELETE | `/api/executors/{executor_id}/maintenance/{item_id}` | исполнитель (Bearer) | — | Удаление записи ТО. |
| POST | `/api/executors/{executor_id}/roles` | исполнитель (Bearer) | — | Добавление роли себе. |
| PUT | `/api/executors/{executor_id}/active-role` | исполнитель (Bearer) | — | Смена активной роли. |
| GET | `/api/executors/{executor_id}/can-accept` | исполнитель (Bearer) | — | Можно ли принимать заказы (роль/отстранение). |
| GET | `/api/executors/{executor_id}/earnings` | исполнитель (Bearer) | — | Наличный заработок по ролям. |

## 11. Услуги мастеров — все public

| Метод | Путь | Авторизация | Риск (только для «нет»/public) | Комментарий |
|---|---|---|---|---|
| GET | `/api/masters/services` | нет (public) | низкий: публичный каталог — названия, цены, имена мастеров | Ожидалось публичное поведение. |
| GET | `/api/masters/{executor_id}/services` | нет (public) | средний: перечисление услуг любого исполнителя по `executor_id` | Нет проверки владельца. |
| POST | `/api/masters/{executor_id}/services` | нет (public) | **высокий**: создание услуги **от имени любого исполнителя** без токена (проверяется только наличие роли «мастер») | Могут появиться фиктивные услуги и цены. |
| PUT | `/api/masters/services/{service_id}` | нет (public) | **высокий**: изменение цен/текста/активности любой услуги без токена | Прямая манипуляция коммерческими данными. |
| DELETE | `/api/masters/services/{service_id}` | нет (public) | **высокий**: удаление любой услуги без токена | Уничтожение данных. |

## 12. Реклама

| Метод | Путь | Авторизация | Риск (только для «нет»/public) | Комментарий |
|---|---|---|---|---|
| GET | `/api/ads` | нет (public) | низкий: активные рекламные блоки, без ПДн | `kind=events` — афиша. |
| GET | `/api/ads/{ad_id}/image` | нет (public) | низкий: изображение рекламы | FileResponse, кэш 1 ч. |
| GET | `/api/admin/ads` | get_staff | — | Включая неактивные. |
| POST | `/api/admin/ads` | get_admin | — | Multipart, картинки до 5 МБ. |
| PUT | `/api/admin/ads/{ad_id}` | get_admin | — | Обновление. |
| DELETE | `/api/admin/ads/{ad_id}` | get_admin | — | Удаление + файла картинки. |

## 13. Геокодирование и карты

| Метод | Путь | Авторизация | Риск (только для «нет»/public) | Комментарий |
|---|---|---|---|---|
| POST | `/api/geo/route` | нет (public) | средний: используется как бесплатный прокси к OSRM (внешние запросы с вашего IP), ПДн нет | Ограничение частоты 1.1 с к внешним сервисам. |
| GET | `/api/geo/search` | нет (public) | низкий/средний: отдаёт и **внутренний справочник адресов админки** (свой город первым), и данные OSM | Нет персональных данных. |
| GET | `/api/geo/city` | нет (public) | низкий: город по координатам (зоны + Nominatim) | — |

## 14. Админка и операторы (main.py)

| Метод | Путь | Авторизация | Риск (только для «нет»/public) | Комментарий |
|---|---|---|---|---|
| GET | `/api/admin/whoami` | get_staff | — | Кто вошёл: admin или operator. |
| GET | `/api/admin/operators` | get_admin | — | Список операторов. |
| POST | `/api/admin/operators` | get_admin | — | Создание оператора (пароль bcrypt). |
| PUT | `/api/admin/operators/{operator_id}` | get_admin | — | Смена логина/пароля/имени. |
| POST | `/api/admin/operators/{operator_id}/toggle` | get_admin | — | Вкл/выкл оператора. |
| DELETE | `/api/admin/operators/{operator_id}` | get_admin | — | Удаление оператора. |
| POST | `/api/admin/settings` | get_admin | — | Настройки (например, `commission_percent`). |
| GET | `/api/admin/settings` | get_admin | — | Чтение настроек. |
| POST | `/api/admin/orders` | get_staff | — | Создание заказа за клиента (диспетчерская). |
| GET | `/api/admin/orders` | get_staff | — | Все заказы с фильтрами. |
| POST | `/api/admin/orders/{order_id}/cancel` | get_staff | — | Отмена заказа оператором. |
| GET | `/api/admin/clients` | get_staff | — | Список клиентов (**перс. данные: телефоны**). |
| GET | `/api/admin/clients/{client_id}/profile` | get_staff | — | Профиль клиента (**телефон, история**). |
| POST | `/api/admin/clients/{client_id}/notifications` | get_admin | — | Сообщение клиенту (в аннотации «админ/оператор», но стоит `get_admin`). |
| POST | `/api/admin/clients/{client_id}/balance` | get_admin | — | **Деньги**: изменение баланса клиента. |
| GET | `/api/admin/executors` | get_staff | — | Список исполнителей (**телефоны, балансы**). |
| POST | `/api/admin/executors/{executor_id}/balance` | get_admin | — | **Деньги**: изменение баланса исполнителя. |
| GET | `/api/admin/dashboard` | get_staff | — | Метрики сервиса, фильтры по району/роли. |
| GET | `/api/admin/analytics` | get_admin | — | Аналитика. |
| GET | `/api/admin/orders/export.csv` | get_admin | — | Выгрузка заказов (CSV). |
| GET | `/api/admin/clients/export.csv` | get_admin | — | Выгрузка клиентов (**перс. данные**). |
| GET | `/api/admin/executors/export.csv` | get_admin | — | Выгрузка исполнителей (**перс. данные**). |
| GET | `/api/admin/city-zones` | get_admin | — | Городские зоны тарифов (PostGIS). |
| POST | `/api/admin/city-zones` | get_admin | — | Создание зоны. |
| PUT | `/api/admin/city-zones/{zone_id}` | get_admin | — | Обновление зоны. |
| DELETE | `/api/admin/city-zones/{zone_id}` | get_admin | — | Мягкое удаление (204). |
| GET | `/api/admin/city-zones/{zone_id}/history` | get_admin | — | История изменений зоны. |
| GET | `/api/admin/map-proxy/{resource:path}` | get_admin | — | Прокси тайлов карты для админки. |

## 15. Админка (роутеры)

| Метод | Путь | Авторизация | Риск (только для «нет»/public) | Комментарий |
|---|---|---|---|---|
| GET | `/api/admin/addresses` | get_staff | — | Справочник адресов (город фильтром). |
| POST | `/api/admin/addresses` | get_admin | — | Добавление адреса. |
| PUT | `/api/admin/addresses/{addr_id}` | get_admin | — | Обновление. |
| DELETE | `/api/admin/addresses/{addr_id}` | get_admin | — | Удаление. |
| GET | `/api/admin/messages` | get_staff | — | Обращения исполнителей. |
| POST | `/api/admin/messages` | get_staff | — | Ответ оператора. |
| PUT | `/api/admin/messages/{message_id}/read` | get_staff | — | Пометить прочитанным. |
| GET | `/api/admin/executors/{executor_id}/profile` | get_staff | — | Расширенный профиль исполнителя (**телефон, ТО, история**). |
| GET | `/api/admin/photo-checks` | get_staff | — | Очередь фото-проверок. |
| POST | `/api/admin/executors/{executor_id}/photo-checks` | get_admin | — | Создание проверки от админа. |
| PUT | `/api/admin/photo-checks/{check_id}` | get_admin | — | Решение по фото-проверке. |
| PUT | `/api/admin/executors/{executor_id}/vehicle` | get_admin | — | Правка транспорта исполнителя. |
| POST | `/api/admin/executors/{executor_id}/suspensions` | get_staff | — | Отстранение от заказов. |
| POST | `/api/admin/executors/{executor_id}/suspensions/{suspension_id}/revoke` | get_staff | — | Отзыв отстранения. |
| PUT | `/api/admin/executors/{executor_id}/status` | get_staff | — | Статус исполнителя (approved/pending/…). |
| GET | `/api/admin/fraud/queue` | get_staff | — | Очередь антифрода (**телефоны клиента и исполнителя**). |
| POST | `/api/admin/fraud/{review_id}/resolve` | get_staff | — | Решение по фроду (блокировка клиента/исполнителя). |

## 16. Вебхук MAX

| Метод | Путь | Авторизация | Риск (только для «нет»/public) | Комментарий |
|---|---|---|---|---|
| POST | `/api/max/webhook/{bot}` | нет (public) + заголовок `X-Max-Bot-Api-Secret` | подделка вебхука — **да, если известен секрет**: сверяется `secrets.compare_digest` с `max_webhook_secret`, а при его отсутствии — **с `jwt_secret`** (тот же ключ, что и у токенов) | Без верного секрета — 403. Умеет писать геопозицию исполнителя (`last_lat/last_lon`) по `sender.user_id`; `{bot}` ∈ `client|executor`. |

## 17. Роутер определён, но не подключён

| Метод | Путь | Авторизация | Риск (только для «нет»/public) | Комментарий |
|---|---|---|---|---|
| GET | `/commissions` | нет (public) | — | `app.include_router(...)` для `routers/commissions.py` **в main.py отсутствует** — маршрут не зарегистрирован. |
| PUT | `/commissions` | нет (public) | **критический, если подключить**: изменение комиссий по всем услугам (0–50%) без авторизации | В коде роутера зависимостей авторизации нет вообще. |

---

## Сводка

- Всего маршрутов в `main.py` и `routers/*.py`: **143** определения (141 зарегистрирован через `include_router` + 2 из `routers/commissions.py`, которые нигде не подключены).
- `main.py`: 64 маршрута; `executors.py`: 32; `order_chain.py`: 7; `tracking.py`: 6; `notifications.py`: 6; `ads.py`: 6; `masters.py`: 5; `addresses.py`: 4; `extras.py`: 3; `geo.py`: 3; `fraud.py`: 2; `maxhook.py`: 2; `clients.py`: 1.
- Префиксы `include_router`: `prefix="/api"` — extras, masters, notifications, clients, order_chain; без префикса — executors, tracking, ads, geo, addresses, maxhook, fraud (у ads/geo/executors/tracking/fraud/maxhook префикс уже внутри `APIRouter(prefix=...)`).
- Подключено роутеров: 12 из 13 файлов в `routers/` (не подключён `commissions.py`).

### Наиболее заметные находки (public / слабая авторизация)

1. `GET /api/available-orders` и `GET /api/orders/available` — пул открытых заказов с адресами и ценами без токена.
2. `POST /api/masters/{executor_id}/services`, `PUT /api/masters/services/{service_id}`, `DELETE /api/masters/services/{service_id}` — полный CRUD услугами мастеров без авторизации.
3. `POST /api/auth/max` и `POST /api/clients/auth` — выдача/привязка аккаунта без проверки подписи MAX (имперсонация).
4. `GET /api/notifications?max_id=` и `PUT /api/notifications/{id}/read` — чтение/изменение чужих уведомлений по `max_id`.
5. `POST /api/ratings` — ветка исполнителя работает по `executor_id` из тела запроса без токена.
6. `POST /api/max/webhook/{bot}` — секрет по умолчанию падает на `jwt_secret`.
7. `POST /api/track/session` — публичный обмен одноразового кода на токен исполнителя.
