import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_session
from app.schemas import LedgerResponse, LedgerRow

router = APIRouter(tags=["ledger"])


@router.get("/runs/{run_id}/ledger", response_model=LedgerResponse)
async def get_ledger(run_id: uuid.UUID, session: AsyncSession = Depends(get_session)) -> LedgerResponse:
    rows = (
        await session.execute(
            text(
                "SELECT seq, kind, target, summary, ts FROM tool_ledger "
                "WHERE run_id = :run_id ORDER BY ts"
            ),
            {"run_id": run_id},
        )
    ).mappings()
    return LedgerResponse(ledger=[LedgerRow(**dict(r)) for r in rows])
