#!/usr/bin/env bash
# Ежедневный бэкап PostgreSQL базы данных супераппа «Про».
#
# Что делает:
#   1. делает pg_dump из контейнера БД (сервис `db` из docker-compose.yml,
#      контейнер по умолчанию называется pro-db-1) и сжимает дамп gzip;
#   2. кладёт копию в /root/backups/pro-ГГГГММДД-ЧЧММ.sql.gz;
#   3. удаляет копии старше 14 дней;
#   4. возвращает ненулевой код выхода при любой ошибке (чтобы cron увидел сбой).
#
# Имя базы и пользователя взяты из docker-compose.yml (services.db.environment:
# POSTGRES_USER / POSTGRES_DB) и .env.example (POSTGRES_USER=pro, POSTGRES_DB=pro).
# Файл .env не читается и не изменяется.
#
# Запуск на сервере от root, из любого каталога:
#   bash /root/pro/scripts/backup_db.sh
#
# Crontab — ежедневно в 04:00 (строка для /var/spool/cron/root или `crontab -e`):
#   0 4 * * * /root/pro/scripts/backup_db.sh >> /var/log/pro-backup.log 2>&1

set -euo pipefail

BACKUP_DIR="/root/backups"
DB_SERVICE="db"       # сервис БД в docker-compose.yml (контейнер pro-db-1)
DB_USER="pro"         # POSTGRES_USER из docker-compose.yml / .env.example
DB_NAME="pro"         # POSTGRES_DB   из docker-compose.yml / .env.example
RETENTION_DAYS=14     # хранить копии 14 дней

STAMP="$(date +%Y%m%d-%H%M)"
FILE="$BACKUP_DIR/$DB_NAME-$STAMP.sql.gz"
TMP="$BACKUP_DIR/.$DB_NAME-$STAMP.sql.gz.part"

log() { echo "[$(date '+%F %T')] $*"; }

# недокачанный копия-кандидат не должен остаться в каталоге бэкапов
cleanup() { rm -f "$TMP"; }
trap cleanup EXIT

mkdir -p "$BACKUP_DIR"

# docker compose запускаем из корня проекта (рядом лежит docker-compose.yml)
cd "$(dirname "$(readlink -f "$0")")/.."

log "начинаю бэкап базы $DB_NAME в $FILE"

# pg_dump внутри контейнера БД; pipefail не даёт проглотить ошибку pg_dump
if ! docker compose exec -T "$DB_SERVICE" \
        pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges \
        | gzip -c > "$TMP"; then
    log "ОШИБКА: pg_dump завершился с ошибкой, бэкап не создан" >&2
    exit 1
fi

if [ ! -s "$TMP" ]; then
    log "ОШИБКА: дамп пустой — бэкап не создан" >&2
    exit 1
fi

if ! gzip -t "$TMP"; then
    log "ОШИБКА: архив повреждён — бэкап не создан" >&2
    exit 1
fi

mv -f "$TMP" "$FILE"
log "бэкап готов: $FILE ($(du -h "$FILE" | cut -f1))"

# чистим копии старше $RETENTION_DAYS дней (строго старше полных 14*24 часов)
removed="$(find "$BACKUP_DIR" -maxdepth 1 -type f \
    -name "$DB_NAME-*.sql.gz" \
    ! -mmin "-$((RETENTION_DAYS * 1440))" -print -delete | wc -l)"
if [ "$removed" -gt 0 ]; then
    log "удалено копий старше $RETENTION_DAYS дней: $removed"
fi

log "итого копий в $BACKUP_DIR: $(find "$BACKUP_DIR" -maxdepth 1 -type f -name "$DB_NAME-*.sql.gz" | wc -l)"
log "бэкап завершён успешно"
