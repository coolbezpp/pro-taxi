"""Транспорт исполнителя и техобслуживание.

executor_vehicles — карточка авто (марка, госномер…): заполняет
администратор/оператор, исполнитель обновляет пробег.
vehicle_maintenance — работы по ТО с интервалом повтора в км.

Revision ID: 0014_vehicle_maintenance
Revises: 0013_identity_rename
"""
from alembic import op
import sqlalchemy as sa

revision = "0014_vehicle_maintenance"
down_revision = "0013_identity_rename"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS executor_vehicles (
            id SERIAL PRIMARY KEY,
            executor_id INTEGER NOT NULL UNIQUE,
            brand VARCHAR,
            model VARCHAR,
            color VARCHAR,
            plate VARCHAR,
            year INTEGER,
            seats INTEGER,
            photo_url TEXT,
            mileage INTEGER DEFAULT 0,
            approved BOOLEAN DEFAULT FALSE,
            last_reminder_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT now(),
            updated_at TIMESTAMP
        )""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_executor_vehicles_executor_id ON executor_vehicles (executor_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS vehicle_maintenance (
            id SERIAL PRIMARY KEY,
            executor_id INTEGER NOT NULL,
            title VARCHAR NOT NULL,
            note VARCHAR,
            done_at TIMESTAMP,
            done_mileage INTEGER DEFAULT 0,
            interval_km INTEGER DEFAULT 0,
            notified_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT now()
        )""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_vehicle_maintenance_executor_id ON vehicle_maintenance (executor_id)")


def downgrade():
    op.execute("DROP TABLE IF EXISTS vehicle_maintenance")
    op.execute("DROP TABLE IF EXISTS executor_vehicles")
