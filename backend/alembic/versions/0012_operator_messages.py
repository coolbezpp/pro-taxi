from alembic import op
import sqlalchemy as sa

# Переписка исполнителя с оператором и системные события для админки.

revision = "0012_operator_messages"
down_revision = "0011_notification_category"


def upgrade():
    op.create_table(
        "operator_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("executor_id", sa.Integer(), nullable=False),
        sa.Column("author_role", sa.String(), nullable=False, server_default="admin"),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_operator_messages_executor_id", "operator_messages", ["executor_id"])


def downgrade():
    op.drop_index("ix_operator_messages_executor_id", table_name="operator_messages")
    op.drop_table("operator_messages")
