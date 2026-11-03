import sqlite3
from pathlib import Path
from contextlib import closing
from typing import Iterator

from fastapi import APIRouter, HTTPException

DB_PATH = (
    Path(__file__).resolve().parents[2]
    / "database"
    / "aeromind.db"
)

router = APIRouter(prefix="/api/system", tags=["Database"])


def open_db(readonly: bool = False) -> sqlite3.Connection:
    if not DB_PATH.is_file():
        raise RuntimeError(
            "SQLite database missing. Run python3 database/init_db.py"
        )

    mode = "ro" if readonly else "rw"

    connection = sqlite3.connect(
        DB_PATH.as_uri() + f"?mode={mode}",
        uri=True,
        timeout=5,
    )

    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 5000")

    return connection


def get_db() -> Iterator[sqlite3.Connection]:
    connection = open_db()

    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


@router.get("/database")
def database_status():
    try:
        with closing(open_db(readonly=True)) as connection:
            version = connection.execute(
                "SELECT MAX(version) FROM schema_migrations"
            ).fetchone()[0]

            integrity = connection.execute(
                "PRAGMA quick_check"
            ).fetchone()[0]

    except (sqlite3.Error, RuntimeError):
        raise HTTPException(
            status_code=503,
            detail="SQLite database unavailable",
        )

    if integrity != "ok" or version is None:
        raise HTTPException(
            status_code=503,
            detail="SQLite database integrity or migration check failed",
        )

    return {
        "status": "connected",
        "database": "SQLite",
        "schema_version": version,
        "integrity": "ok",
    }
