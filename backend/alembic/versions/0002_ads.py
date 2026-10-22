from alembic import op

revision = "0002_ads"
down_revision = "0001_init"


def upgrade():
    from app import models  # noqa
    models.Ad.__table__.create(bind=op.get_bind(), checkfirst=True)


def downgrade():
    from app import models  # noqa
    models.Ad.__table__.drop(bind=op.get_bind(), checkfirst=True)
