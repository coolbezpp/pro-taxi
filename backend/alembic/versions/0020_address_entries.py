"""Справочник адресов (address_entries): свои адреса приоритетны над OSM.

Revision ID: 0020_address_entries
Revises: 0019_tracking_code
"""

from alembic import op
import sqlalchemy as sa

revision = "0020_address_entries"
down_revision = "0019_tracking_code"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "address_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("city", sa.String(120), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lon", sa.Float(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_address_entries_city", "address_entries", ["city"])


def downgrade():
    op.drop_index("ix_address_entries_city", table_name="address_entries")
    op.drop_table("address_entries")
