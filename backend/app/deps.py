"""Shared FastAPI dependencies.

No real auth bridge in this pass (see docs/DB_SCHEMA.md's explicit note) —
the frontend sends the signed-in user's email as a header, and this
dependency finds-or-trusts it. Only endpoints that list/create runs need the
user; run-scoped endpoints (stop, resume, approvals, ...) operate on the run
id directly with no ownership check, consistent with that same shortcut.
"""

from fastapi import Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from app.db.base import get_session
from app.db.models import User


async def get_current_user(
    x_user_email: str = Header(..., alias="X-User-Email"),
    session: AsyncSession = Depends(get_session),
) -> User:
    user = (
        await session.execute(select(User).where(User.email == x_user_email))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="unknown user — call /bootstrap first")
    return user
