"""Merge migration branches

Revision ID: 94caee4126e5
Revises: 674572579cad, 97381547d9fb
Create Date: 2026-08-20 11:55:55.177380

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '94caee4126e5'
down_revision: Union[str, None] = ('674572579cad', '97381547d9fb')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
