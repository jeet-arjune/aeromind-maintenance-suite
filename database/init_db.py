from pathlib import Path
import hashlib
import sqlite3

BASE = Path(__file__).resolve().parent
DB = BASE / "aeromind.db"
MIGRATIONS = BASE / "migrations"

def main():
    connection = sqlite3.connect(DB)

    try:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 5000")
        connection.execute("PRAGMA journal_mode = WAL")

        existing = {
            row[0] for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
                " AND name NOT LIKE 'sqlite_%'"
            )
        }

        if existing and "schema_migrations" not in existing:
            raise RuntimeError(
                "Existing unversioned database detected. "
                "Refusing to modify it automatically."
            )

        connection.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                filename TEXT NOT NULL,
                checksum TEXT NOT NULL,
                applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)
        connection.commit()

        for migration in sorted(MIGRATIONS.glob("[0-9][0-9][0-9]_*.sql")):
            version = int(migration.name[:3])
            content = migration.read_text()
            checksum = hashlib.sha256(content.encode()).hexdigest()

            previous = connection.execute(
                "SELECT checksum FROM schema_migrations WHERE version=?",
                (version,)
            ).fetchone()

            if previous:
                if previous[0] != checksum:
                    raise RuntimeError(
                        f"Migration {version} was changed after applying it."
                    )
                print(f"Already applied: {migration.name}")
                continue

            safe_name = migration.name.replace("'", "''")

            script = (
                "BEGIN IMMEDIATE;\n"
                + content
                + f"\nINSERT INTO schema_migrations "
                  f"(version, filename, checksum) VALUES "
                  f"({version}, '{safe_name}', '{checksum}');\n"
                + "COMMIT;"
            )

            try:
                connection.executescript(script)
            except Exception:
                if connection.in_transaction:
                    connection.rollback()
                raise

            print(f"Applied: {migration.name}")

        violations = connection.execute(
            "PRAGMA foreign_key_check"
        ).fetchall()

        if violations:
            raise RuntimeError(f"Foreign key errors: {violations}")

        tables = [
            row[0] for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
                " AND name NOT LIKE 'sqlite_%'"
                " AND name != 'schema_migrations' ORDER BY name"
            )
        ]

        print(f"\nDatabase: {DB}")
        print(f"Application tables: {len(tables)}")
        print(f"Foreign key violations: {len(violations)}")

        for name in tables:
            print(f"  ✓ {name}")

    finally:
        connection.close()

if __name__ == "__main__":
    main()
