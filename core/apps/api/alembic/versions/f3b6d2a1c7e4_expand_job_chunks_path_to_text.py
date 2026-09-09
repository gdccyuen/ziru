"""expand job_chunks.path to text

Revision ID: f3b6d2a1c7e4
Revises: a1b2c3d4e5f6
Create Date: 2026-09-09 10:00:00.000000

Documents with very long hierarchical section titles (e.g. OG.pdf) produce a
chunk ``path`` longer than ``varchar(1024)``; inserting that row raised
``StringDataRightTruncation`` during job-result finalization, which marked the
(re-)parse job failed even though parsing had succeeded. Widen the column to
``text`` so long paths are preserved.

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "f3b6d2a1c7e4"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: widen job_chunks.path to text."""
    op.alter_column(
        "job_chunks",
        "path",
        existing_type=sa.String(1024),
        type_=sa.Text(),
        existing_nullable=True,
    )


def downgrade() -> None:
    """Downgrade schema: shrink job_chunks.path back to varchar(1024)."""
    op.alter_column(
        "job_chunks",
        "path",
        existing_type=sa.Text(),
        type_=sa.String(1024),
        existing_nullable=True,
    )
