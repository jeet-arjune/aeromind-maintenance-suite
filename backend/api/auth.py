from contextlib import closing
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from secrets import token_urlsafe
from typing import Optional

from argon2 import PasswordHasher
from argon2.exceptions import (
    VerifyMismatchError,
    VerificationError,
    InvalidHashError,
)
from argon2.low_level import Type
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field

if __package__:
    from .sqlite_store import open_db
else:
    from sqlite_store import open_db

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
bearer = HTTPBearer(auto_error=False)
password_hasher = PasswordHasher(type=Type.ID)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=1024)


def unauthorized():
    raise HTTPException(
        status_code=401,
        detail="Invalid or expired credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
):
    if not credentials or credentials.scheme.lower() != "bearer":
        unauthorized()

    token_hash = sha256(credentials.credentials.encode()).hexdigest()

    with closing(open_db(readonly=True)) as db:
        row = db.execute(
            """
            SELECT u.id, u.full_name, u.email, s.expires_at
            FROM auth_sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ?
              AND s.revoked_at IS NULL
              AND u.is_active = 1
            """,
            (token_hash,),
        ).fetchone()

        if not row:
            unauthorized()

        try:
            expiry = datetime.fromisoformat(row["expires_at"])
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
        except ValueError:
            unauthorized()

        if expiry <= datetime.now(timezone.utc):
            unauthorized()

        roles = [
            item["name"]
            for item in db.execute(
                """
                SELECT r.name
                FROM user_roles ur
                JOIN roles r ON r.id = ur.role_id
                WHERE ur.user_id = ?
                """,
                (row["id"],),
            )
        ]

        return {
            "id": row["id"],
            "full_name": row["full_name"],
            "email": row["email"],
            "roles": roles,
        }


def require_roles(*allowed_roles):
    def check(user=Depends(get_current_user)):
        if not set(user["roles"]).intersection(allowed_roles):
            raise HTTPException(
                status_code=403,
                detail="Insufficient permissions",
            )
        return user

    return check


@router.post("/login")
def login(data: LoginRequest):
    email = data.email.strip().lower()

    with closing(open_db()) as db:
        user = db.execute(
            """
            SELECT id, password_hash, is_active
            FROM users WHERE email = ?
            """,
            (email,),
        ).fetchone()

        if not user or not user["is_active"]:
            unauthorized()

        try:
            password_hasher.verify(
                user["password_hash"], data.password
            )
        except (
            VerifyMismatchError,
            VerificationError,
            InvalidHashError,
        ):
            unauthorized()

        token = token_urlsafe(32)
        token_hash = sha256(token.encode()).hexdigest()

        expiry = (
            datetime.now(timezone.utc) + timedelta(hours=8)
        ).isoformat(timespec="seconds")

        db.execute(
            """
            INSERT INTO auth_sessions
                (user_id, token_hash, expires_at)
            VALUES (?, ?, ?)
            """,
            (user["id"], token_hash, expiry),
        )
        db.commit()

    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_at": expiry,
    }


@router.get("/me")
def my_profile(user=Depends(get_current_user)):
    return user


@router.post("/logout")
def logout(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    user=Depends(get_current_user),
):
    token_hash = sha256(credentials.credentials.encode()).hexdigest()

    with closing(open_db()) as db:
        db.execute(
            """
            UPDATE auth_sessions
            SET revoked_at = CURRENT_TIMESTAMP
            WHERE token_hash = ? AND user_id = ?
            """,
            (token_hash, user["id"]),
        )
        db.commit()

    return {"status": "logged_out"}


@router.get("/admin-check")
def admin_check(user=Depends(require_roles("admin"))):
    return {
        "status": "authorized",
        "user": user["full_name"],
    }
