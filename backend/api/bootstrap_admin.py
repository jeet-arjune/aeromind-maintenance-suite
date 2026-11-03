import getpass
import re
from contextlib import closing

from .auth import password_hasher
from .sqlite_store import open_db


def main():
    print("\nAeroMind — Initial Admin Setup\n")

    name = input("Full name: ").strip()
    email = input("Email address: ").strip().lower()

    if not name:
        raise SystemExit("A full name is required.")

    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise SystemExit("Enter a valid email address.")

    password = getpass.getpass("Create password (12+ characters): ")
    confirm = getpass.getpass("Confirm password: ")

    if len(password) < 12:
        raise SystemExit("Password must have at least 12 characters.")

    if password != confirm:
        raise SystemExit("Passwords do not match.")

    hashed = password_hasher.hash(password)

    with closing(open_db()) as db:
        try:
            db.execute("BEGIN IMMEDIATE")

            count = db.execute(
                "SELECT COUNT(*) FROM users"
            ).fetchone()[0]

            if count:
                raise SystemExit(
                    "Users already exist. Initial setup is disabled."
                )

            role = db.execute(
                "SELECT id FROM roles WHERE name = 'admin'"
            ).fetchone()

            if not role:
                raise RuntimeError("Admin role is missing.")

            cursor = db.execute(
                """
                INSERT INTO users
                    (full_name, email, password_hash)
                VALUES (?, ?, ?)
                """,
                (name, email, hashed),
            )

            user_id = cursor.lastrowid

            db.execute(
                """
                INSERT INTO user_roles
                    (user_id, role_id, granted_by_user_id)
                VALUES (?, ?, ?)
                """,
                (user_id, role["id"], user_id),
            )

            db.commit()

        except BaseException:
            db.rollback()
            raise

    print("\nAdmin account created successfully.")
    print(f"Name: {name}")
    print(f"Email: {email}")
    print("Role: admin")


if __name__ == "__main__":
    main()
