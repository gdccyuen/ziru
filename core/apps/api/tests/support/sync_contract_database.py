from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.engine import Connection


def insert_contract_user(
    connection: Connection,
    *,
    user_id: str,
    name: str | None = None,
    email: str | None = None,
) -> None:
    connection.execute(
        text(
            """
            INSERT INTO users (
                id, email, password_hash, grade, profile,
                must_change_password, disabled, created_at, updated_at
            ) VALUES (
                :user_id, :email, :password_hash, :grade, NULL,
                false, false, :created_at, :updated_at
            )
            """
        ),
        {
            "user_id": user_id,
            "email": email or f"{user_id}@contract.ziru.local",
            "password_hash": "contract-placeholder-hash",
            "grade": "user",
            "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "updated_at": datetime.now(timezone.utc).replace(tzinfo=None),
        },
    )
