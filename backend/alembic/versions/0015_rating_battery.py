"""Рейтинг «батареей» и временное отстранение от заказов.

- executors: rating_percent (кэш процента like за последние 100 оценок,
  изначально 100), rating_notified_level (порог последнего уведомления).
- clients: rating_percent — аналогично, для отображения клиенту.
- executor_suspensions: истории отстранений (авто при рейтинге ниже
  50% или вручную администратором).
Проценты существующих аккаунтов заполняются из ratings по заказам.

Revision ID: 0015_rating_battery
Revises: 0014_vehicle_maintenance
"""
from alembic import op
import sqlalchemy as sa

revision = "0015_rating_battery"
down_revision = "0014_vehicle_maintenance"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE executors ADD COLUMN IF NOT EXISTS rating_percent INTEGER DEFAULT 100")
    op.execute("ALTER TABLE executors ADD COLUMN IF NOT EXISTS rating_notified_level INTEGER")
    op.execute("ALTER TABLE clients ADD COLUMN IF NOT EXISTS rating_percent INTEGER DEFAULT 100")

    op.execute("""
        CREATE TABLE IF NOT EXISTS executor_suspensions (
            id SERIAL PRIMARY KEY,
            executor_id INTEGER NOT NULL,
            starts_at TIMESTAMP NOT NULL,
            ends_at TIMESTAMP NOT NULL,
            reason TEXT,
            source VARCHAR NOT NULL DEFAULT 'admin',
            created_by VARCHAR,
            created_at TIMESTAMP DEFAULT now(),
            revoked_at TIMESTAMP,
            revoked_by VARCHAR
        )""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_executor_suspensions_executor_id ON executor_suspensions (executor_id)")

    # Бэкфилл: процент = доля like среди оценок, поставленных клиентами
    # исполнителям (автор = клиент заказа — защита от совпадения id таблиц)
    op.execute("""
        UPDATE executors e SET rating_percent = COALESCE((
            SELECT ROUND(100.0 * SUM(CASE WHEN r.value = 'like' THEN 1 ELSE 0 END) / COUNT(*))
            FROM ratings r JOIN orders o ON o.id = r.order_id
            WHERE r.target_id = e.id
              AND r.author_id = o.client_id
              AND o.executor_id = e.id
        ), 100)""")
    op.execute("""
        UPDATE clients c SET rating_percent = COALESCE((
            SELECT ROUND(100.0 * SUM(CASE WHEN r.value = 'like' THEN 1 ELSE 0 END) / COUNT(*))
            FROM ratings r JOIN orders o ON o.id = r.order_id
            WHERE r.target_id = c.id
              AND r.author_id = o.executor_id
              AND o.client_id = c.id
        ), 100)""")


def downgrade():
    op.execute("DROP TABLE IF EXISTS executor_suspensions")
    op.execute("ALTER TABLE clients DROP COLUMN IF EXISTS rating_percent")
    op.execute("ALTER TABLE executors DROP COLUMN IF EXISTS rating_notified_level")
    op.execute("ALTER TABLE executors DROP COLUMN IF EXISTS rating_percent")
