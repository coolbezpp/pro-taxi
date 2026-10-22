from alembic import op
import sqlalchemy as sa

# Чат по заказу и последняя геопозиция исполнителя (отслеживание движения).

revision = "0007_order_messages_position"
down_revision = "0006_work_sessions"


def upgrade():
    op.create_table(
        "order_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("author_role", sa.String(), nullable=False),
        sa.Column("author_id", sa.Integer(), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_order_messages_order_id", "order_messages", ["order_id"])

    op.add_column("executors", sa.Column("last_lat", sa.Float(), nullable=True))
    op.add_column("executors", sa.Column("last_lon", sa.Float(), nullable=True))
    op.add_column("executors", sa.Column("last_seen_at", sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column("executors", "last_seen_at")
    op.drop_column("executors", "last_lon")
    op.drop_column("executors", "last_lat")
    op.drop_index("ix_order_messages_order_id", table_name="order_messages")
    op.drop_table("order_messages")
