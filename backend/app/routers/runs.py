"""/runs, create, list, detail, plan approve/reject, stop, resume, messages,
autonomy. See docs/API.md for the full contract this implements.
"""

import asyncio
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_session
from app.db.models import QueuedMessage, Run, User
from app.deps import get_current_user
from app.orchestrator.event_bus import append_event
from app.orchestrator.supervisor import manager
from app.planner.cmo_planner import propose_plan
from app.planner.schemas import Plan
from app.usage import PlanUsage
from app.schemas import (
    AutonomyPatchRequest,
    EventOut,
    EventsResponse,
    MessageCreateRequest,
    MessageOut,
    PlanApproveRequest,
    PlanRejectRequest,
    ResumeRequest,
    RunCreateRequest,
    RunCreateResponse,
    RunDetailResponse,
    RunListResponse,
    RunOut,
    RunSummary,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/runs", tags=["runs"])


async def _record_plan_usage(session: AsyncSession, run_id: uuid.UUID, plan_usage: PlanUsage) -> None:
    """Emits the real, API-reported spend for the CMO's planning call(s).
    One event per attempt, so a retry's cost is visible rather than folded
    invisibly into a single total."""
    for attempt, usage in enumerate(plan_usage.attempts):
        await append_event(
            session,
            run_id=run_id,
            scope_id=None,
            parent_scope_id=None,
            phase_id=None,
            type_="usage.recorded",
            payload={
                **usage.as_payload(source="cmo_planner", simulated=False),
                "attempt": attempt + 1,
            },
        )


def _conflict(run: Run, action: str, required_state: str) -> HTTPException:
    detail = f"run is {run.state}, not {required_state}"
    logger.warning(
        "409 on %s: run=%s current_state=%s required_state=%s",
        action, run.id, run.state, required_state,
    )
    return HTTPException(status_code=409, detail=detail)


def _run_out(run: Run) -> RunOut:
    return RunOut(
        id=run.id,
        title=run.title,
        state=run.state,
        autonomy_mode=run.autonomy_mode,
        current_phase_id=run.current_phase_id,
        created_at=run.created_at,
        updated_at=run.updated_at,
    )


async def _get_run_or_404(session: AsyncSession, run_id: uuid.UUID) -> Run:
    run = await session.get(Run, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="run not found")
    return run


@router.post("", response_model=RunCreateResponse, status_code=201)
async def create_run(
    body: RunCreateRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> RunCreateResponse:
    logger.info("create_run: user=%s autonomy_mode=%s title=%r", user.id, body.autonomy_mode, body.title)
    plan, plan_usage = await propose_plan(body.brief, body.autonomy_mode)
    logger.info("create_run: planner returned %d phases", len(plan.phases))

    run = Run(
        user_id=user.id,
        title=body.title,
        brief=body.brief,
        autonomy_mode=body.autonomy_mode,
        state="awaiting_plan_approval",
        plan=plan.model_dump(mode="json"),
    )
    session.add(run)
    await session.commit()
    await session.refresh(run)

    await append_event(
        session,
        run_id=run.id,
        scope_id=None,
        parent_scope_id=None,
        phase_id=None,
        type_="plan.proposed",
        payload=plan.model_dump(mode="json"),
    )
    await _record_plan_usage(session, run.id, plan_usage)

    if body.autonomy_mode == "just_run":
        run.state = "running"
        await session.commit()
        await append_event(
            session,
            run_id=run.id,
            scope_id=None,
            parent_scope_id=None,
            phase_id=None,
            type_="plan.approved",
            payload={"auto": True},
        )
        manager.start_run(run.id)
        logger.info("create_run: %s auto-approved (just_run), orchestrator started", run.id)
    else:
        logger.info("create_run: %s awaiting_plan_approval", run.id)

    return RunCreateResponse(run=_run_out(run), plan=plan)


@router.get("", response_model=RunListResponse)
async def list_runs(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> RunListResponse:
    runs = (
        (
            await session.execute(
                select(Run).where(Run.user_id == user.id).order_by(Run.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return RunListResponse(
        runs=[
            RunSummary(id=r.id, title=r.title, state=r.state, created_at=r.created_at)
            for r in runs
        ]
    )


@router.get("/{run_id}", response_model=RunDetailResponse)
async def get_run(run_id: uuid.UUID, session: AsyncSession = Depends(get_session)) -> RunDetailResponse:
    run = await _get_run_or_404(session, run_id)
    plan = Plan.model_validate(run.plan) if run.plan else None
    return RunDetailResponse(run=_run_out(run), plan=plan)


@router.get("/{run_id}/events", response_model=EventsResponse)
async def get_events(
    run_id: uuid.UUID, since: int = 0, session: AsyncSession = Depends(get_session)
) -> EventsResponse:
    from sqlalchemy import text

    rows = (
        await session.execute(
            text(
                "SELECT run_id, seq, ts, scope_id, parent_scope_id, phase_id, type, payload "
                "FROM run_events WHERE run_id = :run_id AND seq > :since ORDER BY seq"
            ),
            {"run_id": run_id, "since": since},
        )
    ).mappings()
    return EventsResponse(events=[EventOut(**dict(r)) for r in rows])


@router.post("/{run_id}/plan/approve", response_model=RunDetailResponse)
async def approve_plan(
    run_id: uuid.UUID, body: PlanApproveRequest, session: AsyncSession = Depends(get_session)
) -> RunDetailResponse:
    run = await _get_run_or_404(session, run_id)
    logger.info("approve_plan: run=%s current_state=%s", run_id, run.state)
    if run.state != "awaiting_plan_approval":
        raise _conflict(run, "approve_plan", "awaiting_plan_approval")

    plan = body.edited_plan or Plan.model_validate(run.plan)
    if body.edited_plan is not None:
        run.plan = plan.model_dump(mode="json")
        await session.commit()
        await append_event(
            session,
            run_id=run.id,
            scope_id=None,
            parent_scope_id=None,
            phase_id=None,
            type_="plan.edited",
            payload=plan.model_dump(mode="json"),
        )

    run.state = "running"
    await session.commit()
    await append_event(
        session,
        run_id=run.id,
        scope_id=None,
        parent_scope_id=None,
        phase_id=None,
        type_="plan.approved",
        payload={},
    )
    manager.start_run(run.id)
    logger.info("approve_plan: run=%s now running, orchestrator started", run.id)

    return RunDetailResponse(run=_run_out(run), plan=plan)


@router.post("/{run_id}/plan/reject", response_model=RunDetailResponse)
async def reject_plan(
    run_id: uuid.UUID, body: PlanRejectRequest, session: AsyncSession = Depends(get_session)
) -> RunDetailResponse:
    run = await _get_run_or_404(session, run_id)
    logger.info("reject_plan: run=%s current_state=%s note=%r", run_id, run.state, body.note)
    if run.state != "awaiting_plan_approval":
        raise _conflict(run, "reject_plan", "awaiting_plan_approval")

    await append_event(
        session,
        run_id=run.id,
        scope_id=None,
        parent_scope_id=None,
        phase_id=None,
        type_="plan.rejected",
        payload={"note": body.note},
    )

    new_plan, plan_usage = await propose_plan(
        f"{run.brief}\n\nOperator feedback: {body.note}", run.autonomy_mode
    )
    run.plan = new_plan.model_dump(mode="json")
    await session.commit()
    await append_event(
        session,
        run_id=run.id,
        scope_id=None,
        parent_scope_id=None,
        phase_id=None,
        type_="plan.proposed",
        payload=new_plan.model_dump(mode="json"),
    )
    await _record_plan_usage(session, run.id, plan_usage)

    return RunDetailResponse(run=_run_out(run), plan=new_plan)


@router.post("/{run_id}/stop", status_code=202)
async def stop_run(run_id: uuid.UUID, session: AsyncSession = Depends(get_session)) -> dict:
    run = await _get_run_or_404(session, run_id)
    logger.info("stop_run: run=%s current_state=%s", run_id, run.state)
    if run.state != "running":
        raise _conflict(run, "stop_run", "running")

    run.state = "stopping"
    await session.commit()
    await append_event(
        session,
        run_id=run.id,
        scope_id=None,
        parent_scope_id=None,
        phase_id=None,
        type_="stop.requested",
        payload={},
    )
    # `run.state_changed` is what the frontend actually keys its local
    # runState off of (see plan.approved/run.state_changed handling in
    # lib/dashboard/state.ts's applyEvent), without this, a client watching
    # this run never learns it left "running" until the eventual terminal
    # event, which meant a second stop click in that window 409'd.
    await append_event(
        session,
        run_id=run.id,
        scope_id=None,
        parent_scope_id=None,
        phase_id=None,
        type_="run.state_changed",
        payload={"state": "stopping"},
    )
    # Fire-and-forget: the HTTP response acknowledges within the 500ms budget;
    # the run reaches `stopped` (checkpoint written) asynchronously, observed
    # via the event stream; see docs/API.md.
    asyncio.create_task(manager.stop_run(run.id))
    logger.info("stop_run: run=%s -> stopping, SIGINT dispatch in flight", run.id)

    return {"run": {"state": "stopping"}}


@router.post("/{run_id}/resume", response_model=RunDetailResponse)
async def resume_run(
    run_id: uuid.UUID, body: ResumeRequest, session: AsyncSession = Depends(get_session)
) -> RunDetailResponse:
    run = await _get_run_or_404(session, run_id)
    logger.info("resume_run: run=%s current_state=%s redirect=%r", run_id, run.state, body.redirect)
    if run.state != "stopped":
        raise _conflict(run, "resume_run", "stopped")

    run.state = "running"
    await session.commit()
    await append_event(
        session,
        run_id=run.id,
        scope_id=None,
        parent_scope_id=None,
        phase_id=None,
        type_="resume.requested",
        payload={"redirect": body.redirect},
    )
    # Without this, nothing ever tells a connected client the run left
    # "stopped", resume doesn't route through `_finish()` the way a
    # completed/failed/stopped run does, so the frontend's local runState
    # was getting stuck at "stopped" forever, leaving the resume button
    # visibly clickable even after resume had already succeeded.
    await append_event(
        session,
        run_id=run.id,
        scope_id=None,
        parent_scope_id=None,
        phase_id=None,
        type_="run.state_changed",
        payload={"state": "running"},
    )
    manager.resume_run(run.id, body.redirect)
    logger.info("resume_run: run=%s -> running, orchestrator restarted", run.id)

    plan = Plan.model_validate(run.plan)
    return RunDetailResponse(run=_run_out(run), plan=plan)


@router.post("/{run_id}/messages", response_model=MessageOut, status_code=201)
async def queue_message(
    run_id: uuid.UUID, body: MessageCreateRequest, session: AsyncSession = Depends(get_session)
) -> MessageOut:
    await _get_run_or_404(session, run_id)
    message = QueuedMessage(run_id=run_id, body=body.body)
    session.add(message)
    await session.commit()
    await session.refresh(message)

    await append_event(
        session,
        run_id=run_id,
        scope_id=None,
        parent_scope_id=None,
        phase_id=None,
        type_="message.queued",
        payload={"body": body.body},
    )

    return MessageOut(id=message.id, state=message.state, deliver_after_phase_id=None)


@router.delete("/{run_id}/messages/{message_id}")
async def cancel_message(
    run_id: uuid.UUID, message_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> dict:
    message = await session.get(QueuedMessage, message_id)
    if message is None or message.run_id != run_id:
        raise HTTPException(status_code=404, detail="message not found")
    if message.state != "queued":
        raise HTTPException(status_code=409, detail=f"message already {message.state}")

    message.state = "cancelled"
    await session.commit()
    await append_event(
        session,
        run_id=run_id,
        scope_id=None,
        parent_scope_id=None,
        phase_id=None,
        type_="message.cancelled",
        payload={},
    )
    return {"message": {"id": str(message_id), "state": "cancelled"}}


@router.patch("/{run_id}/autonomy", response_model=RunOut)
async def patch_autonomy(
    run_id: uuid.UUID, body: AutonomyPatchRequest, session: AsyncSession = Depends(get_session)
) -> RunOut:
    run = await _get_run_or_404(session, run_id)
    run.autonomy_mode = body.autonomy_mode
    await session.commit()
    return _run_out(run)
