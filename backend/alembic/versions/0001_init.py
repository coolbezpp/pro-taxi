from alembic import op
revision="0001_init"; down_revision=None
def upgrade():
    from app.db import Base
    from app import models  # noqa
    Base.metadata.create_all(op.get_bind())
def downgrade():
    from app.db import Base
    from app import models  # noqa
    Base.metadata.drop_all(op.get_bind())
