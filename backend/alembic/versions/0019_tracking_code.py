"""Одноразовый код входа для страницы GPS-трекинга (tracking_codes).

GPS в вебвью MAX заблокирован — трекинг идёт через системный браузер
телефона (/executor/track.html), вход по одноразовому коду из миниаппа.

Revision ID: 0019_tracking_code
Revises: 0018_antifraud
"""

from alembic import op
import sqlalchemy as sa

revision = "0019_tracking_code"
down_revision = "0018_antifraud"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "tracking_codes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("executor_id", sa.Integer(), sa.ForeignKey("executors.id"), nullable=False),
        sa.Column("code_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_tracking_codes_executor_id", "tracking_codes", ["executor_id"])
    op.create_index("ix_tracking_codes_code_hash", "tracking_codes", ["code_hash"])


def downgrade():
    op.drop_index("ix_tracking_codes_code_hash", table_name="tracking_codes")
    op.drop_index("ix_tracking_codes_executor_id", table_name="tracking_codes")
    op.drop_table("tracking_codes")
