"""add import_logs.file_hash

Revision ID: c1d2e3f4a5b6
Revises: a2c3d4e5f6a7
Create Date: 2026-06-21
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, None] = "a2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("import_logs", sa.Column("file_hash", sa.String(length=64), nullable=True))
    op.create_index("ix_import_logs_file_hash", "import_logs", ["file_hash"])


def downgrade() -> None:
    op.drop_index("ix_import_logs_file_hash", table_name="import_logs")
    op.drop_column("import_logs", "file_hash")
