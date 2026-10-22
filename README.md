# Про — суперапп городских услуг Краснодарского края

Готовый к деплою монорепозиторий: backend API, миниап клиента, миниап исполнителя, веб-админка, Docker Compose.

## Быстрый деплой на сервер
1. Загрузите папку проекта на сервер: `scp -r pro user@server:/opt/pro`
2. Установите Docker и Docker Compose.
3. В `.env` укажите домен, секреты и токен бота MAX.
4. Запустите: `docker compose up -d --build`
5. Примените миграции: `docker compose exec api alembic upgrade head`
6. Создайте администратора: `docker compose exec api python scripts/create_admin.py`
7. Откройте: `https://ваш-домен/admin` — админка; API: `https://ваш-домен/api/docs`

## Миниапы в MAX
- Клиент: `https://ваш-домен/client`
- Исполнитель: `https://ваш-домен/executor`
В настройках бота MAX укажите URL миниапа и включите HTTPS.

## Комиссия
Администратор меняет размер комиссии в админке: Настройки → Комиссия агрегатора, %. По умолчанию 15%.
