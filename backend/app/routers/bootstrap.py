from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_session
from app.db.models import Run, User
from app.schemas import BootstrapRequest, BootstrapResponse, RunSummary, UserOut

router = APIRouter(tags=["bootstrap"])


@router.post("/bootstrap", response_model=BootstrapResponse)
async def bootstrap(
    body: BootstrapRequest, session: AsyncSession = Depends(get_session)
) -> BootstrapResponse:
    user = (
        await session.execute(select(User).where(User.email == body.email))
    ).scalar_one_or_none()

    if user is None:
        user = User(email=body.email, name=body.name)
        session.add(user)
        await session.commit()
        await session.refresh(user)

    runs = (
        (
            await session.execute(
                select(Run).where(Run.user_id == user.id).order_by(Run.created_at.desc())
            )
        )
        .scalars()
        .all()
    )

    return BootstrapResponse(
        user=UserOut(id=user.id, email=user.email, name=user.name),
        runs=[
            RunSummary(id=r.id, title=r.title, state=r.state, created_at=r.created_at)
            for r in runs
        ],
    )
