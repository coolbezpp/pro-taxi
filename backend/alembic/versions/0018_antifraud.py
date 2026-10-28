"""Антифрод MVP (docs/ANTIFRAUD.md): device-сессии, сигналы пар,
очередь оператора + блокировка клиента.

Revision ID: 0018_antifraud
Revises: 0017_executor_session
"""

from alembic import op
import sqlalchemy as sa

revision = "0018_antifraud"
down_revision = "0017_executor_session"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "device_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_max_id", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("device_id", sa.String(), nullable=False),
        sa.Column("ip_hash", sa.String(), nullable=True),
        sa.Column("ua_hash", sa.String(), nullable=True),
        sa.Column("first_seen", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("last_seen", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_device_sessions_user_max_id", "device_sessions", ["user_max_id"])
    op.create_index("ix_device_sessions_device_id", "device_sessions", ["device_id"])

    op.create_table(
        "fraud_signals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("pair_key", sa.String(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False, server_default="0"),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_fraud_signals_pair_key", "fraud_signals", ["pair_key"])

    op.create_table(
        "fraud_reviews",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("pair_key", sa.String(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=True),
        sa.Column("executor_id", sa.Integer(), nullable=True),
        sa.Column("risk_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(), nullable=False, server_default="open"),
        sa.Column("allowlisted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("resolved_by", sa.String(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_fraud_reviews_pair_key", "fraud_reviews", ["pair_key"], unique=True)

    op.add_column(
        "clients",
        sa.Column("blocked", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade():
    op.drop_column("clients", "blocked")
    op.drop_index("ix_fraud_reviews_pair_key", table_name="fraud_reviews")
    op.drop_table("fraud_reviews")
    op.drop_index("ix_fraud_signals_pair_key", table_name="fraud_signals")
    op.drop_table("fraud_signals")
    op.drop_index("ix_device_sessions_device_id", table_name="device_sessions")
    op.drop_index("ix_device_sessions_user_max_id", table_name="device_sessions")
    op.drop_table("device_sessions")
