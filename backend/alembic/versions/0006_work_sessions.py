from alembic import op
import sqlalchemy as sa

# Смены исполнителя: контроль рабочего времени (12 ч лимит, предупреждение
# за 2 ч, отдых 6 ч между сменами).

revision = "0006_work_sessions"
down_revision = "0005_balance_ops_photo_checks"


def upgrade():
    op.create_table(
        "executor_work_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("executor_id", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("last_activity_at", sa.DateTime(), nullable=False),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.Column("warned_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_executor_work_sessions_executor_id", "executor_work_sessions", ["executor_id"]
    )


def downgrade():
    op.drop_index("ix_executor_work_sessions_executor_id", table_name="executor_work_sessions")
    op.drop_table("executor_work_sessions")
