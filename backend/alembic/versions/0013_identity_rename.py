"""Переименование идентичности заказов и снос легаси-таблиц профиля водителя.

orders.passenger_id -> client_id, orders.driver_id -> executor_id:
данные переносятся из legacy-колонок (они были рабочими), затем legacy удаляются.

Таблицы driver_profiles, vehicles, driver_documents, photo_checks,
balance_transactions — пустые легаси (в коде не используются, 0 строк).

Revision ID: 0013_identity_rename
Revises: 0012_operator_messages
"""
from alembic import op
import sqlalchemy as sa

revision = "0013_identity_rename"
down_revision = "0012_operator_messages"
branch_labels = None
depends_on = None


def upgrade():
    # --- orders: новые колонки могли быть добавлены вручную ранее ---
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_id integer")
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS executor_id integer")
    # источник истины — legacy-колонки, через них работал код
    op.execute("UPDATE orders SET client_id = passenger_id WHERE passenger_id IS NOT NULL")
    op.execute("UPDATE orders SET executor_id = driver_id WHERE driver_id IS NOT NULL")
    op.execute("DROP INDEX IF EXISTS ix_orders_passenger_id")
    op.execute("DROP INDEX IF EXISTS ix_orders_driver_id")
    op.execute("ALTER TABLE orders DROP COLUMN IF EXISTS passenger_id")
    op.execute("ALTER TABLE orders DROP COLUMN IF EXISTS driver_id")
    op.execute("CREATE INDEX IF NOT EXISTS ix_orders_client_id ON orders (client_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_orders_executor_id ON orders (executor_id)")

    # --- пустые легаси-таблицы старого «профиля водителя» (направленный drop) ---
    op.execute("DROP TABLE IF EXISTS vehicles")
    op.execute("DROP TABLE IF EXISTS driver_documents")
    op.execute("DROP TABLE IF EXISTS photo_checks")
    op.execute("DROP TABLE IF EXISTS balance_transactions")
    op.execute("DROP TABLE IF EXISTS driver_profiles")


def downgrade():
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS passenger_id integer")
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_id integer")
    op.execute("UPDATE orders SET passenger_id = client_id WHERE client_id IS NOT NULL")
    op.execute("UPDATE orders SET driver_id = executor_id WHERE executor_id IS NOT NULL")
    op.execute("DROP INDEX IF EXISTS ix_orders_client_id")
    op.execute("DROP INDEX IF EXISTS ix_orders_executor_id")
    op.execute("ALTER TABLE orders DROP COLUMN IF EXISTS client_id")
    op.execute("ALTER TABLE orders DROP COLUMN IF EXISTS executor_id")
    op.execute("CREATE INDEX IF NOT EXISTS ix_orders_passenger_id ON orders (passenger_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_orders_driver_id ON orders (driver_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS driver_profiles (
            id integer PRIMARY KEY,
            user_id integer UNIQUE REFERENCES users(id),
            full_name varchar, license_number varchar,
            experience_years integer, medical_until timestamp,
            online boolean DEFAULT false,
            child_seats integer DEFAULT 0,
            animals_allowed boolean DEFAULT false,
            intercity_enabled boolean DEFAULT false,
            child_tariff_enabled boolean DEFAULT false,
            rating_likes integer DEFAULT 0,
            rating_dislikes integer DEFAULT 0,
            balance float DEFAULT 0
        )""")
    op.execute("""
        CREATE TABLE IF NOT EXISTS vehicles (
            id integer PRIMARY KEY,
            driver_id integer REFERENCES driver_profiles(id),
            brand varchar, model varchar, color varchar, plate varchar,
            inspection_until timestamp, insurance_until timestamp,
            taxi_permit boolean DEFAULT false, approved boolean DEFAULT false
        )""")
    op.execute("""
        CREATE TABLE IF NOT EXISTS driver_documents (
            id integer PRIMARY KEY,
            driver_id integer REFERENCES driver_profiles(id),
            type varchar, file_url varchar,
            status varchar DEFAULT 'pending',
            expires_at timestamp, reviewed_by integer
        )""")
    op.execute("""
        CREATE TABLE IF NOT EXISTS photo_checks (
            id integer PRIMARY KEY,
            driver_id integer REFERENCES driver_profiles(id),
            photo_url varchar, status varchar DEFAULT 'pending',
            decision_by integer, created_at timestamp DEFAULT now()
        )""")
    op.execute("""
        CREATE TABLE IF NOT EXISTS balance_transactions (
            id integer PRIMARY KEY,
            driver_id integer REFERENCES driver_profiles(id),
            type varchar, amount float,
            status varchar DEFAULT 'pending',
            order_id integer, created_at timestamp DEFAULT now()
        )""")
