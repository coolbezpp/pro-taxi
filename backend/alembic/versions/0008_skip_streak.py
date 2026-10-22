from alembic import op
import sqlalchemy as sa

# Снятие с линии за пропуск заказов: флаг «на линии» и счётчик пропусков.

revision = "0008_skip_streak"
down_revision = "0007_order_messages_position"


def upgrade():
    op.add_column(
        "executors",
        sa.Column("is_online", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "executors",
        sa.Column("skip_streak", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade():
    op.drop_column("executors", "skip_streak")
    op.drop_column("executors", "is_online")
