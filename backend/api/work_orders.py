import json
import secrets
from contextlib import closing
from pathlib import Path
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

if __package__:
    from .auth import require_roles
    from .sqlite_store import open_db
else:
    from auth import require_roles
    from sqlite_store import open_db

router = APIRouter(
    prefix="/api/work-orders",
    tags=["Maintenance Work Orders"]
)

ROOT = Path(__file__).resolve().parents[2]
FLEET_CACHE = ROOT / "database" / "fleet_analysis.json"

Priority = Literal["low", "medium", "high", "critical"]
Status = Literal[
    "open", "assigned", "in_progress", "on_hold",
    "pending_review", "completed", "cancelled"
]
Activity = Literal[
    "inspection", "repair", "replacement", "test", "other"
]


class CreateOrder(BaseModel):
    engine_id: int = Field(ge=1, le=100)
    title: str = Field(min_length=4, max_length=160)
    description: str = Field(default="", max_length=2000)
    priority: Priority = "medium"
    assigned_to_user_id: Optional[int] = None


class UpdateOrder(BaseModel):
    status: Optional[Status] = None
    assigned_to_user_id: Optional[int] = None


class MaintenanceLog(BaseModel):
    activity_type: Activity = "inspection"
    summary: str = Field(min_length=4, max_length=1000)
    details: str = Field(default="", max_length=4000)
    labor_minutes: int = Field(default=0, ge=0, le=100000)


TRANSITIONS = {
    "open": {"assigned", "cancelled"},
    "assigned": {"open", "in_progress", "cancelled"},
    "in_progress": {"on_hold", "pending_review", "cancelled"},
    "on_hold": {"in_progress", "cancelled"},
    "pending_review": {"in_progress", "completed", "cancelled"},
    "completed": set(),
    "cancelled": set(),
}


def privileged(user):
    return bool(set(user["roles"]) & {"admin", "supervisor"})


def order_details(db, order_id):
    row = db.execute(
        """
        SELECT w.id, w.order_number, w.title, w.description,
               w.priority, w.status, w.assigned_to_user_id,
               w.created_at, w.updated_at, w.started_at,
               w.completed_at, e.engine_code,
               t.full_name AS technician_name
        FROM work_orders w
        JOIN engines e ON e.id = w.engine_id
        LEFT JOIN users t ON t.id = w.assigned_to_user_id
        WHERE w.id = ?
        """,
        (order_id,)
    ).fetchone()
    return dict(row) if row else None


def require_order_access(db, order_id, user):
    order = order_details(db, order_id)
    if not order:
        raise HTTPException(404, "Work order not found")
    if not privileged(user) and order["assigned_to_user_id"] != user["id"]:
        raise HTTPException(403, "This work order is not assigned to you")
    return order


def validate_technician(db, technician_id):
    row = db.execute(
        """
        SELECT u.id
        FROM users u
        JOIN technician_profiles p ON p.user_id = u.id
        JOIN user_roles ur ON ur.user_id = u.id
        JOIN roles r ON r.id = ur.role_id
        WHERE u.id = ? AND u.is_active = 1
          AND p.availability = 'available'
          AND r.name = 'technician'
        """,
        (technician_id,)
    ).fetchone()
    if not row:
        raise HTTPException(
            422, "Select an active, available technician"
        )


def resolve_engine(db, engine_id):
    try:
        fleet = json.loads(FLEET_CACHE.read_text())
        engine = next(
            (
                item for item in fleet["engines"]
                if int(item["engine_id"]) == engine_id
            ),
            None
        )
    except (OSError, ValueError, KeyError, TypeError):
        raise HTTPException(503, "Fleet analysis data unavailable")

    if engine is None:
        raise HTTPException(404, "Engine not found in simulated fleet")

    code = f"AC-{engine_id:03d}"
    row = db.execute(
        "SELECT id FROM engines WHERE engine_code = ?",
        (code,)
    ).fetchone()
    if row:
        return row["id"]

    priority = str(engine.get("maintenance_priority", "")).upper()
    health = (
        "critical" if priority == "CRITICAL"
        else "at_risk" if priority == "UNDER OBSERVATION"
        else "healthy"
    )

    cursor = db.execute(
        """
        INSERT INTO engines
          (engine_code, data_origin, dataset_source,
           dataset_split, dataset_unit_id, health_status)
        VALUES (?, 'simulated', 'NASA C-MAPSS FD001',
                'test', ?, ?)
        """,
        (code, engine_id, health)
    )
    return cursor.lastrowid


def record_event(db, order_id, actor_id, event_type, old, new):
    db.execute(
        """
        INSERT INTO work_order_events
          (work_order_id, actor_user_id, event_type,
           old_value_json, new_value_json)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            order_id, actor_id, event_type,
            json.dumps(old) if old is not None else None,
            json.dumps(new) if new is not None else None
        )
    )
    db.execute(
        """
        INSERT INTO audit_events
          (actor_user_id, action, entity_type, entity_id,
           old_values_json, new_values_json)
        VALUES (?, ?, 'work_order', ?, ?, ?)
        """,
        (
            actor_id, event_type, str(order_id),
            json.dumps(old) if old is not None else None,
            json.dumps(new) if new is not None else None
        )
    )


@router.get("")
def list_orders(
    user=Depends(require_roles("admin", "supervisor", "technician"))
):
    with closing(open_db(readonly=True)) as db:
        if privileged(user):
            ids = db.execute(
                "SELECT id FROM work_orders ORDER BY created_at DESC, id DESC"
            ).fetchall()
        else:
            ids = db.execute(
                """
                SELECT id FROM work_orders
                WHERE assigned_to_user_id = ?
                ORDER BY created_at DESC, id DESC
                """,
                (user["id"],)
            ).fetchall()
        return [order_details(db, row["id"]) for row in ids]


@router.post("", status_code=201)
def create_order(
    data: CreateOrder,
    user=Depends(require_roles("admin", "supervisor"))
):
    with closing(open_db()) as db:
        try:
            db.execute("BEGIN IMMEDIATE")
            engine_db_id = resolve_engine(db, data.engine_id)

            if data.assigned_to_user_id is not None:
                validate_technician(db, data.assigned_to_user_id)

            status = (
                "assigned" if data.assigned_to_user_id is not None
                else "open"
            )
            number = "WO-" + secrets.token_hex(7).upper()

            cursor = db.execute(
                """
                INSERT INTO work_orders
                  (order_number, engine_id, title, description,
                   priority, status, assigned_to_user_id,
                   created_by_user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    number, engine_db_id, data.title.strip(),
                    data.description.strip(), data.priority, status,
                    data.assigned_to_user_id, user["id"]
                )
            )
            order = order_details(db, cursor.lastrowid)
            record_event(
                db, cursor.lastrowid, user["id"],
                "work_order.created", None, order
            )
            db.commit()
            return order
        except Exception:
            db.rollback()
            raise


@router.patch("/{order_id}")
def update_order(
    order_id: int,
    data: UpdateOrder,
    user=Depends(require_roles("admin", "supervisor", "technician"))
):
    changes = data.dict(exclude_unset=True)
    if not changes:
        raise HTTPException(400, "No changes supplied")

    with closing(open_db()) as db:
        try:
            db.execute("BEGIN IMMEDIATE")
            old = require_order_access(db, order_id, user)

            if not privileged(user):
                if set(changes) != {"status"}:
                    raise HTTPException(403, "Technicians can update status only")
                if changes["status"] not in {
                    "in_progress", "on_hold", "pending_review"
                }:
                    raise HTTPException(403, "Status requires supervisor approval")

            status = changes.get("status", old["status"])
            assignee = changes.get(
                "assigned_to_user_id", old["assigned_to_user_id"]
            )

            if status is None:
                raise HTTPException(422, "Status cannot be null")

            if "assigned_to_user_id" in changes and assignee is not None:
                validate_technician(db, assignee)

            if status != old["status"]:
                if status not in TRANSITIONS[old["status"]]:
                    raise HTTPException(
                        409, "Invalid work order status transition"
                    )

            if status in {"assigned", "in_progress", "on_hold",
                          "pending_review", "completed"} and assignee is None:
                raise HTTPException(422, "Assign a technician first")

            if status == "completed":
                count = db.execute(
                    "SELECT COUNT(*) FROM maintenance_logs WHERE work_order_id = ?",
                    (order_id,)
                ).fetchone()[0]
                if count == 0:
                    raise HTTPException(
                        409, "Add a maintenance log before completion"
                    )

            if status == "open" and assignee is not None:
                raise HTTPException(
                    422, "An assigned order cannot have Open status"
                )

            if status != old["status"] or assignee != old["assigned_to_user_id"]:
                db.execute(
                    """
                    UPDATE work_orders
                    SET status = ?, assigned_to_user_id = ?,
                        updated_at = CURRENT_TIMESTAMP,
                        started_at = CASE
                          WHEN ? = 'in_progress' AND started_at IS NULL
                          THEN CURRENT_TIMESTAMP ELSE started_at END,
                        completed_at = CASE
                          WHEN ? = 'completed'
                          THEN CURRENT_TIMESTAMP ELSE completed_at END,
                        verified_by_user_id = CASE
                          WHEN ? = 'completed'
                          THEN ? ELSE verified_by_user_id END,
                        verified_at = CASE
                          WHEN ? = 'completed'
                          THEN CURRENT_TIMESTAMP ELSE verified_at END
                    WHERE id = ?
                    """,
                    (
                        status, assignee, status, status,
                        status, user["id"], status, order_id
                    )
                )
                updated = order_details(db, order_id)
                record_event(
                    db, order_id, user["id"],
                    "work_order.updated", old, updated
                )
            else:
                updated = old

            db.commit()
            return updated
        except Exception:
            db.rollback()
            raise


@router.post("/{order_id}/logs", status_code=201)
def add_log(
    order_id: int,
    data: MaintenanceLog,
    user=Depends(require_roles("admin", "supervisor", "technician"))
):
    with closing(open_db()) as db:
        try:
            db.execute("BEGIN IMMEDIATE")
            order = require_order_access(db, order_id, user)
            if order["status"] not in {
                "assigned", "in_progress", "on_hold"
            }:
                raise HTTPException(
                    409, "Maintenance logs require an active assignment"
                )

            technician_id = order["assigned_to_user_id"]
            if technician_id is None:
                raise HTTPException(422, "Assign a technician first")

            cursor = db.execute(
                """
                INSERT INTO maintenance_logs
                  (work_order_id, technician_user_id, activity_type,
                   summary, details, labor_minutes)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    order_id, technician_id, data.activity_type,
                    data.summary.strip(), data.details.strip(),
                    data.labor_minutes
                )
            )
            record_event(
                db, order_id, user["id"], "maintenance_log.added",
                None, {"log_id": cursor.lastrowid,
                       "summary": data.summary.strip()}
            )
            db.commit()
            return {"id": cursor.lastrowid, "status": "recorded"}
        except Exception:
            db.rollback()
            raise


@router.get("/{order_id}/history")
def order_history(
    order_id: int,
    user=Depends(require_roles("admin", "supervisor", "technician"))
):
    with closing(open_db(readonly=True)) as db:
        require_order_access(db, order_id, user)
        events = db.execute(
            """
            SELECT event_type, occurred_at, note
            FROM work_order_events
            WHERE work_order_id = ?
            ORDER BY id DESC
            """,
            (order_id,)
        ).fetchall()
        logs = db.execute(
            """
            SELECT activity_type, summary, details,
                   labor_minutes, performed_at
            FROM maintenance_logs
            WHERE work_order_id = ?
            ORDER BY id DESC
            """,
            (order_id,)
        ).fetchall()
        return {
            "events": [dict(row) for row in events],
            "logs": [dict(row) for row in logs]
        }
