"""Одна живая сессия исполнителя: executors.session_id (sid в токене).

При входе на новом телефоне генерируется новый sid — токен со старым sid
получает 401 «Выполнен вход на другом устройстве».

Revision ID: 0017_executor_session
Revises: 0016_operator_role
"""

from alembic import op
import sqlalchemy as sa

revision = "0017_executor_session"
down_revision = "0016_operator_role"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("executors", sa.Column("session_id", sa.String(), nullable=True))


def downgrade():
    op.drop_column("executors", "session_id")
