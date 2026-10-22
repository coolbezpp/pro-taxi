from alembic import op
import sqlalchemy as sa

# Фото-контроль: тип проверки, комментарий модератора, кто и когда решил.

revision = "0009_photo_check_kinds"
down_revision = "0008_skip_streak"


def upgrade():
    op.add_column(
        "executor_photo_checks", sa.Column("kind", sa.String(), nullable=False, server_default="car")
    )
    op.add_column("executor_photo_checks", sa.Column("decision_comment", sa.Text(), nullable=True))
    op.add_column("executor_photo_checks", sa.Column("decided_by", sa.Integer(), nullable=True))
    op.add_column("executor_photo_checks", sa.Column("decided_at", sa.DateTime(), nullable=True))
    op.add_column(
        "executor_photo_checks",
        sa.Column("requested_at", sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_column("executor_photo_checks", "requested_at")
    op.drop_column("executor_photo_checks", "decided_at")
    op.drop_column("executor_photo_checks", "decided_by")
    op.drop_column("executor_photo_checks", "decision_comment")
    op.drop_column("executor_photo_checks", "kind")
