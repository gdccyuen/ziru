"""add retrieval_params to chat_threads

Revision ID: e9c8f7a6b5d4
Revises: d7e9f1a2c3b4
Create Date: 2026-08-22 07:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e9c8f7a6b5d4'
down_revision: Union[str, Sequence[str], None] = 'd7e9f1a2c3b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'chat_threads',
        sa.Column('retrieval_params', sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('chat_threads', 'retrieval_params')
