"""Роль «Оператор» (вход по логину/паролю) + клиентские чаты поддержки.

- operators: операторы/диспетчеры, которых назначает администратор
  (выдаёт логин и пароль). Вход по логину/паролю в админку.
- operator_messages: добавляем client_id, чтобы чат поддержки был и у
  клиентов; executor_id становится опциональным (строка — либо клиент,
  либо исполнитель).

Revision ID: 0016_operator_role
Revises: 0015_rating_battery
"""

from alembic import op
import sqlalchemy as sa

revision = "0016_operator_role"
down_revision = "0015_rating_battery"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "operators",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("login", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_operators_login", "operators", ["login"], unique=True)

    op.add_column(
        "operator_messages",
        sa.Column("client_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_operator_messages_client_id", "operator_messages", ["client_id"]
    )
    op.alter_column("operator_messages", "executor_id", nullable=True)


def downgrade():
    op.alter_column("operator_messages", "executor_id", nullable=False)
    op.drop_index("ix_operator_messages_client_id", table_name="operator_messages")
    op.drop_column("operator_messages", "client_id")
    op.drop_index("ix_operators_login", table_name="operators")
    op.drop_table("operators")
