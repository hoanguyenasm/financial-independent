"""add nw_snapshots table

Revision ID: a2c3d4e5f6a7
Revises: b617f50e886c
Create Date: 2026-06-13 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a2c3d4e5f6a7'
down_revision: Union[str, None] = 'b617f50e886c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'nw_snapshots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('net_worth', sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('date'),
    )
    op.create_index('ix_nw_snapshots_date', 'nw_snapshots', ['date'])


def downgrade() -> None:
    op.drop_index('ix_nw_snapshots_date', table_name='nw_snapshots')
    op.drop_table('nw_snapshots')
