from alembic import op
import sqlalchemy as sa

# Снимаем ошибочные FK с orders.passenger_id / orders.driver_id:
# в них пишутся clients.id и executors.id, а не users.id
# (иначе создание заказа падало бы с нарушением FK для исполнителей после первого).
# Добавляем счётчики оценок исполнителя (рейтинг).

revision = "0003_identity_fix"
down_revision = "0002_ads"


def upgrade():
    op.drop_constraint("orders_passenger_id_fkey", "orders", type_="foreignkey")
    op.drop_constraint("orders_driver_id_fkey", "orders", type_="foreignkey")
    op.create_index("ix_orders_passenger_id", "orders", ["passenger_id"])
    op.create_index("ix_orders_driver_id", "orders", ["driver_id"])
    op.add_column("executors", sa.Column("rating_likes", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("executors", sa.Column("rating_dislikes", sa.Integer(), nullable=False, server_default="0"))


def downgrade():
    op.drop_column("executors", "rating_dislikes")
    op.drop_column("executors", "rating_likes")
    op.drop_index("ix_orders_driver_id", table_name="orders")
    op.drop_index("ix_orders_passenger_id", table_name="orders")
    op.create_foreign_key("orders_passenger_id_fkey", "orders", "users", ["passenger_id"], ["id"])
    op.create_foreign_key("orders_driver_id_fkey", "orders", "users", ["driver_id"], ["id"])
