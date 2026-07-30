import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_session
from app.db.models import Approval
from app.orchestrator.event_bus import append_event
from app.schemas import ApprovalDenyRequest, ApprovalGrantRequest, ApprovalOut

router = APIRouter(prefix="/approvals", tags=["approvals"])


async def _get_or_404(session: AsyncSession, approval_id: uuid.UUID) -> Approval:
    approval = await session.get(Approval, approval_id)
    if approval is None:
        raise HTTPException(status_code=404, detail="approval not found")
    return approval


@router.post("/{approval_id}/grant", response_model=ApprovalOut)
async def grant(
    approval_id: uuid.UUID,
    body: ApprovalGrantRequest,
    session: AsyncSession = Depends(get_session),
) -> ApprovalOut:
    approval = await _get_or_404(session, approval_id)
    if approval.state != "pending":
        raise HTTPException(status_code=409, detail=f"approval already {approval.state}")

    if body.edited_payload is not None:
        approval.edited_payload = body.edited_payload
        await append_event(
            session,
            run_id=approval.run_id,
            scope_id=approval.scope_id,
            parent_scope_id=None,
            phase_id=None,
            type_="approval.edited",
            payload={"approval_id": str(approval_id)},
        )

    approval.state = "granted"
    approval.resolved_at = datetime.now(timezone.utc)
    await session.commit()
    await append_event(
        session,
        run_id=approval.run_id,
        scope_id=approval.scope_id,
        parent_scope_id=None,
        phase_id=None,
        type_="approval.granted",
        payload={"approval_id": str(approval_id)},
    )
    return ApprovalOut(id=approval.id, state=approval.state)


@router.post("/{approval_id}/deny", response_model=ApprovalOut)
async def deny(
    approval_id: uuid.UUID,
    body: ApprovalDenyRequest,
    session: AsyncSession = Depends(get_session),
) -> ApprovalOut:
    approval = await _get_or_404(session, approval_id)
    if approval.state != "pending":
        raise HTTPException(status_code=409, detail=f"approval already {approval.state}")

    approval.state = "denied"
    approval.resolved_at = datetime.now(timezone.utc)
    await session.commit()
    await append_event(
        session,
        run_id=approval.run_id,
        scope_id=approval.scope_id,
        parent_scope_id=None,
        phase_id=None,
        type_="approval.denied",
        payload={"reason": body.reason},
    )
    return ApprovalOut(id=approval.id, state=approval.state)
