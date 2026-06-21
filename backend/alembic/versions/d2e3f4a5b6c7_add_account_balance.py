"""add accounts.balance + balance_as_of

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-06-21
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "d2e3f4a5b6c7"
down_revision: Union[str, None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("balance", sa.Numeric(18, 2), nullable=True))
    op.add_column("accounts", sa.Column("balance_as_of", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("accounts", "balance_as_of")
    op.drop_column("accounts", "balance")
