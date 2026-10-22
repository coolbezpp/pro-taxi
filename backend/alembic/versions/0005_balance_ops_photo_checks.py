from alembic import op
import sqlalchemy as sa

# Журнал операций по балансу исполнителя (заработок/пополнения/корректировки)
# и заявки на фото-контроль.

revision = "0005_balance_ops_photo_checks"
down_revision = "0004_share_rating"


def upgrade():
    op.create_table(
        "executor_balance_ops",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("executor_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(), nullable=False, server_default="earning"),
        sa.Column("amount", sa.Float(), nullable=False, server_default="0"),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("comment", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_executor_balance_ops_executor_id", "executor_balance_ops", ["executor_id"]
    )

    op.create_table(
        "executor_photo_checks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("executor_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("photo_url", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("answered_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_executor_photo_checks_executor_id", "executor_photo_checks", ["executor_id"]
    )


def downgrade():
    op.drop_index("ix_executor_photo_checks_executor_id", table_name="executor_photo_checks")
    op.drop_table("executor_photo_checks")
    op.drop_index("ix_executor_balance_ops_executor_id", table_name="executor_balance_ops")
    op.drop_table("executor_balance_ops")
