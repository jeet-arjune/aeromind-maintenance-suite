import json
import re
import sqlite3
from contextlib import closing
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

if __package__:
    from .auth import require_roles, password_hasher
    from .sqlite_store import open_db
else:
    from auth import require_roles, password_hasher
    from sqlite_store import open_db


router = APIRouter(
    prefix="/api/technicians",
    tags=["Technician Management"]
)

Shift = Literal[
    "morning", "evening", "night", "rotating", "unassigned"
]
Availability = Literal["available", "busy", "on_leave"]


class TechnicianCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=12, max_length=1024)
    employee_code: str = Field(min_length=2, max_length=40)
    specialization: str = Field(min_length=2, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=32)
    shift: Shift = "unassigned"
    availability: Availability = "available"


class TechnicianUpdate(BaseModel):
    full_name: Optional[str] = Field(
        default=None, min_length=2, max_length=120
    )
    phone: Optional[str] = Field(default=None, max_length=32)
    specialization: Optional[str] = Field(
        default=None, min_length=2, max_length=120
    )
    shift: Optional[Shift] = None
    availability: Optional[Availability] = None
    notes: Optional[str] = Field(default=None, max_length=1000)


def get_technician(db, technician_id):
    row = db.execute(
        """
        SELECT
            u.id, u.full_name, u.email, u.phone,
            u.is_active, u.created_at,
            p.employee_code, p.specialization,
            p.shift, p.availability, p.notes
        FROM technician_profiles p
        JOIN users u ON u.id = p.user_id
        WHERE u.id = ?
        """,
        (technician_id,)
    ).fetchone()

    if row is None:
        return None

    result = dict(row)
    result["is_active"] = bool(result["is_active"])
    return result


def record_audit(db, actor_id, action, technician_id, old, new):
    db.execute(
        """
        INSERT INTO audit_events
            (actor_user_id, action, entity_type, entity_id,
             old_values_json, new_values_json)
        VALUES (?, ?, 'technician', ?, ?, ?)
        """,
        (
            actor_id,
            action,
            str(technician_id),
            json.dumps(old) if old is not None else None,
            json.dumps(new) if new is not None else None,
        )
    )


@router.get("")
def list_technicians(
    user=Depends(require_roles("admin", "supervisor"))
):
    with closing(open_db(readonly=True)) as db:
        ids = db.execute(
            """
            SELECT user_id FROM technician_profiles
            ORDER BY employee_code
            """
        ).fetchall()

        return [
            get_technician(db, row["user_id"])
            for row in ids
        ]


@router.get("/{technician_id}")
def technician_details(
    technician_id: int,
    user=Depends(require_roles("admin", "supervisor"))
):
    with closing(open_db(readonly=True)) as db:
        technician = get_technician(db, technician_id)

    if technician is None:
        raise HTTPException(404, "Technician not found")

    return technician


@router.post("", status_code=201)
def create_technician(
    data: TechnicianCreate,
    user=Depends(require_roles("admin"))
):
    email = data.email.strip().lower()
    name = data.full_name.strip()
    code = data.employee_code.strip().upper()
    specialization = data.specialization.strip()

    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(422, "Invalid email address")

    if not name or not code or not specialization:
        raise HTTPException(422, "Required fields cannot be blank")

    hashed_password = password_hasher.hash(data.password)

    with closing(open_db()) as db:
        try:
            db.execute("BEGIN IMMEDIATE")

            role = db.execute(
                "SELECT id FROM roles WHERE name = 'technician'"
            ).fetchone()

            if role is None:
                raise HTTPException(500, "Technician role missing")

            cursor = db.execute(
                """
                INSERT INTO users
                    (full_name, email, password_hash, phone)
                VALUES (?, ?, ?, ?)
                """,
                (name, email, hashed_password, data.phone)
            )

            technician_id = cursor.lastrowid

            db.execute(
                """
                INSERT INTO user_roles
                    (user_id, role_id, granted_by_user_id)
                VALUES (?, ?, ?)
                """,
                (technician_id, role["id"], user["id"])
            )

            db.execute(
                """
                INSERT INTO technician_profiles
                    (user_id, employee_code, specialization,
                     shift, availability)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    technician_id, code, specialization,
                    data.shift, data.availability
                )
            )

            technician = get_technician(db, technician_id)

            record_audit(
                db, user["id"], "technician.created",
                technician_id, None, technician
            )

            db.commit()

        except sqlite3.IntegrityError:
            db.rollback()
            raise HTTPException(
                409, "Email or employee code already exists"
            )
        except Exception:
            db.rollback()
            raise

    return technician


@router.patch("/{technician_id}")
def update_technician(
    technician_id: int,
    data: TechnicianUpdate,
    user=Depends(require_roles("admin"))
):
    changes = data.dict(exclude_unset=True)

    if not changes:
        raise HTTPException(400, "No changes provided")

    for key in ("full_name", "specialization", "shift", "availability"):
        if key in changes and changes[key] is None:
            raise HTTPException(422, f"{key} cannot be null")

    for key in ("full_name", "specialization"):
        if key in changes:
            changes[key] = changes[key].strip()
            if not changes[key]:
                raise HTTPException(422, f"{key} cannot be blank")

    user_fields = {
        k: v for k, v in changes.items()
        if k in ("full_name", "phone")
    }

    profile_fields = {
        k: v for k, v in changes.items()
        if k in ("specialization", "shift", "availability", "notes")
    }

    with closing(open_db()) as db:
        try:
            db.execute("BEGIN IMMEDIATE")

            old = get_technician(db, technician_id)

            if old is None:
                raise HTTPException(404, "Technician not found")

            if user_fields:
                columns = ", ".join(
                    f"{k} = ?" for k in user_fields
                )
                db.execute(
                    f"UPDATE users SET {columns}, "
                    "updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (*user_fields.values(), technician_id)
                )

            if profile_fields:
                columns = ", ".join(
                    f"{k} = ?" for k in profile_fields
                )
                db.execute(
                    f"UPDATE technician_profiles SET {columns}, "
                    "updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
                    (*profile_fields.values(), technician_id)
                )

            updated = get_technician(db, technician_id)

            record_audit(
                db, user["id"], "technician.updated",
                technician_id, old, updated
            )

            db.commit()

        except Exception:
            db.rollback()
            raise

    return updated


@router.post("/{technician_id}/deactivate")
def deactivate_technician(
    technician_id: int,
    user=Depends(require_roles("admin"))
):
    with closing(open_db()) as db:
        try:
            db.execute("BEGIN IMMEDIATE")

            old = get_technician(db, technician_id)

            if old is None:
                raise HTTPException(404, "Technician not found")

            if old["is_active"]:
                db.execute(
                    """
                    UPDATE users
                    SET is_active = 0,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (technician_id,)
                )

                db.execute(
                    """
                    UPDATE technician_profiles
                    SET availability = 'inactive',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = ?
                    """,
                    (technician_id,)
                )

                db.execute(
                    """
                    UPDATE auth_sessions
                    SET revoked_at = CURRENT_TIMESTAMP
                    WHERE user_id = ? AND revoked_at IS NULL
                    """,
                    (technician_id,)
                )

                updated = get_technician(db, technician_id)

                record_audit(
                    db, user["id"], "technician.deactivated",
                    technician_id, old, updated
                )
            else:
                updated = old

            db.commit()

        except Exception:
            db.rollback()
            raise

    return {
        "message": "Technician account inactive",
        "technician": updated
    }
