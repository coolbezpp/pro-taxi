from alembic import op
import sqlalchemy as sa

# Категория уведомлений: service (сервисные) или order (события по заказам).
# В профиле исполнителя показываются только сервисные.

revision = "0011_notification_category"
down_revision = "0010_client_favorites"


def upgrade():
    op.add_column(
        "notifications",
        sa.Column("category", sa.String(), nullable=False, server_default="service"),
    )
    op.execute("UPDATE notifications SET category = 'order' WHERE order_id IS NOT NULL")


def downgrade():
    op.drop_column("notifications", "category")
