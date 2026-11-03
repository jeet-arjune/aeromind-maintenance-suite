"""Initialize an administrator for an ephemeral Render demo database."""

import os
import re
from contextlib import closing

from .auth import password_hasher
from .sqlite_store import open_db


def main():
    email = os.getenv("DEMO_ADMIN_EMAIL", "").strip().lower()
    password = os.getenv("DEMO_ADMIN_PASSWORD", "")

    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise SystemExit("Set a valid DEMO_ADMIN_EMAIL in Render.")

    if len(password) < 12:
        raise SystemExit(
            "Set DEMO_ADMIN_PASSWORD to a strong password of 12+ characters."
        )

    with closing(open_db()) as db:
        try:
            db.execute("BEGIN IMMEDIATE")

            existing = db.execute(
                "SELECT COUNT(*) FROM users"
            ).fetchone()[0]

            if existing:
                db.commit()
                print("Existing demo users preserved.")
                return

            role = db.execute(
                "SELECT id FROM roles WHERE name = 'admin'"
            ).fetchone()

            if not role:
                raise RuntimeError("Admin role missing from database.")

            cursor = db.execute(
                """
                INSERT INTO users (full_name, email, password_hash)
                VALUES (?, ?, ?)
                """,
                (
                    "AeroMind Demo Administrator",
                    email,
                    password_hasher.hash(password),
                ),
            )

            admin_id = cursor.lastrowid

            db.execute(
                """
                INSERT INTO user_roles
                    (user_id, role_id, granted_by_user_id)
                VALUES (?, ?, ?)
                """,
                (admin_id, role["id"], admin_id),
            )

            db.commit()
            print("Demo administrator initialized.")

        except Exception:
            db.rollback()
            raise


if __name__ == "__main__":
    main()
