from alembic import op
import sqlalchemy as sa

# Избранные заказы клиента: отметка и своё название.

revision = "0010_client_favorites"
down_revision = "0009_photo_check_kinds"


def upgrade():
    op.add_column(
        "orders",
        sa.Column("favorite", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("orders", sa.Column("favorite_title", sa.String(120), nullable=True))


def downgrade():
    op.drop_column("orders", "favorite_title")
    op.drop_column("orders", "favorite")
