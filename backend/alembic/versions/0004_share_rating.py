from alembic import op
import sqlalchemy as sa

# Фик: код публичной ссылки «Поделиться поездкой» на заказе.
# Заодно: уникальный индекс оценки (order_id, author_id) —
# защита от двойной оценки одной стороны на уровне БД.

revision = "0004_share_rating"
down_revision = "0003_identity_fix"


def upgrade():
    op.add_column("orders", sa.Column("share_code", sa.String(32), nullable=True))
    op.execute(
        "UPDATE orders SET share_code = md5(random()::text || clock_timestamp()::text) "
        "WHERE share_code IS NULL"
    )
    op.create_index("ix_orders_share_code", "orders", ["share_code"], unique=True)
    op.create_index(
        "uq_rating_order_author", "ratings", ["order_id", "author_id"], unique=True
    )
    # разделы рекламы: бизнес-баннеры (home) и афиша (events) + дата мероприятия
    op.add_column(
        "ads", sa.Column("placement", sa.String(20), nullable=False, server_default="home")
    )
    op.add_column("ads", sa.Column("event_date", sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column("ads", "event_date")
    op.drop_column("ads", "placement")
    op.drop_index("uq_rating_order_author", table_name="ratings")
    op.drop_index("ix_orders_share_code", table_name="orders")
    op.drop_column("orders", "share_code")
