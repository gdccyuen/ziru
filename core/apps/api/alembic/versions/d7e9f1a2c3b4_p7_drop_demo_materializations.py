"""P7: drop demo materializations table (demo catalog removed)

Revision ID: d7e9f1a2c3b4
Revises: c4f2a1b3e9d7
Create Date: 2026-08-22 09:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd7e9f1a2c3b4'
down_revision: Union[str, Sequence[str], None] = 'c4f2a1b3e9d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Drop the retired demo materializations table."""
    op.drop_index('idx_demo_materializations_document', table_name='demo_materializations')
    op.drop_table('demo_materializations')


def downgrade() -> None:
    """Recreate the demo materializations table (best-effort)."""
    op.create_table(
        'demo_materializations',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.Text(), nullable=False),
        sa.Column('namespace', sa.String(length=255), nullable=False),
        sa.Column('demo_source_id', sa.String(length=128), nullable=False),
        sa.Column('document_id', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['document_id'], ['documents.document_id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'namespace', 'demo_source_id', name='uq_demo_materializations_scope_source'),
    )
    op.create_index('idx_demo_materializations_document', 'demo_materializations', ['document_id'], unique=False)
