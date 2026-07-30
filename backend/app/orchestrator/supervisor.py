"""RunSupervisor — drives one run's phase DAG, spawning a real subagent
subprocess per phase and reacting to SIGINT-triggered stops.

Simplifications deliberately made for this skeleton (documented here rather
than silently built in):
- A phase interrupted by SIGINT (its scope ends in `stopped`) is left at
  phase status `running` rather than a dedicated "paused" status — `resume`
  finds it by that same status and re-spawns it. A phase whose process died
  without going through BaseAgent's normal exit path is marked `failed`.
- Stop's checkpoint summary is a plain template string, not a second live
  Claude call — the one real LLM call in this pass is the CMO's planning
  call (`app/planner/cmo_planner.py`); see docs/ARCHITECTURE.md §6.3 for the
  fuller design this simplifies.
- `resume` with a `redirect` note folds it into the restarted phase's
  `task_brief` rather than a full keep/discard/revised/new re-plan.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.base import async_session
from app.db.models import Checkpoint, Run, Scope
from app.orchestrator.agent_process import AgentProcess
from app.orchestrator.event_bus import append_event

logger = logging.getLogger(__name__)

POLL_INTERVAL_S = 0.5


@dataclass
class _RunState:
    stop_event: asyncio.Event
    task: asyncio.Task | None = None
    live: dict[uuid.UUID, AgentProcess] = field(default_factory=dict)


def _phase_by_id(phases: list[dict], phase_id: str) -> dict | None:
    return next((p for p in phases if p["id"] == phase_id), None)


class RunSupervisorManager:
    def __init__(self) -> None:
        self._runs: dict[uuid.UUID, _RunState] = {}

    def start_run(self, run_id: uuid.UUID) -> None:
        logger.info("supervisor: starting driver task for run=%s", run_id)
        state = _RunState(stop_event=asyncio.Event())
        state.task = asyncio.create_task(self._drive(run_id, state))
        self._runs[run_id] = state

    async def stop_run(self, run_id: uuid.UUID) -> None:
        state = self._runs.get(run_id)
        if state is None:
            logger.warning("supervisor: stop_run called but no driver task tracked for run=%s", run_id)
            return
        logger.info("supervisor: signalling stop for run=%s (%d live agent(s))", run_id, len(state.live))
        state.stop_event.set()
        if state.task:
            await state.task

    def resume_run(self, run_id: uuid.UUID, redirect: str | None) -> None:
        logger.info("supervisor: resuming driver task for run=%s redirect=%r", run_id, redirect)
        state = _RunState(stop_event=asyncio.Event())
        state.task = asyncio.create_task(self._drive(run_id, state, redirect=redirect))
        self._runs[run_id] = state

    # ------------------------------------------------------------------

    async def _drive(
        self, run_id: uuid.UUID, state: _RunState, redirect: str | None = None
    ) -> None:
        async with async_session() as session:
            run = await session.get(Run, run_id)
            assert run is not None
            phases: list[dict] = run.plan["phases"]

        if redirect:
            for p in phases:
                if p["status"] == "running":
                    p["task_brief_redirect"] = redirect

        try:
            while True:
                if state.stop_event.is_set():
                    await asyncio.gather(
                        *(p.stop() for p in state.live.values()), return_exceptions=True
                    )
                    for scope_id in list(state.live):
                        await self._reconcile(run_id, scope_id, phases)
                        del state.live[scope_id]
                    await self._finish(run_id, phases, "stopped")
                    return

                ready = [
                    p
                    for p in phases
                    if p["status"] == "pending"
                    and all(
                        (_phase_by_id(phases, dep) or {}).get("status") == "completed"
                        for dep in p["depends_on"]
                    )
                ]
                capacity = settings.max_concurrent_subagents - len(state.live)
                for phase in ready[: max(0, capacity)]:
                    await self._spawn(run_id, phase, phases, state.live)

                finished = [sid for sid, p in state.live.items() if p.returncode is not None]
                for scope_id in finished:
                    await self._reconcile(run_id, scope_id, phases)
                    del state.live[scope_id]

                if not state.live and all(p["status"] in ("completed", "failed") for p in phases):
                    await self._finish(run_id, phases, "completed")
                    return

                await asyncio.sleep(POLL_INTERVAL_S)
        except Exception:
            logger.exception("run %s crashed", run_id)
            await self._finish(run_id, phases, "failed")

    async def _spawn(
        self,
        run_id: uuid.UUID,
        phase: dict,
        phases: list[dict],
        live: dict[uuid.UUID, AgentProcess],
    ) -> None:
        scope_id = uuid.uuid4()
        task_brief = {
            "intent": phase["intent"],
            "expected_outputs": phase["expected_outputs"],
            "phase_title": phase["title"],
        }
        if phase.get("task_brief_redirect"):
            task_brief["redirect"] = phase["task_brief_redirect"]

        async with async_session() as session:
            session.add(
                Scope(
                    id=scope_id,
                    run_id=run_id,
                    agent_name=phase["assigned_agent"],
                    phase_id=uuid.UUID(phase["id"]),
                    state="spawned",
                    task_brief=task_brief,
                )
            )
            await session.commit()

        process = AgentProcess(scope_id=scope_id, run_id=run_id)
        pid = await process.start()
        live[scope_id] = process
        logger.info(
            "supervisor: spawned agents.%s as PID %d (run=%s scope=%s phase=%r)",
            phase["assigned_agent"], pid, run_id, scope_id, phase["title"],
        )

        async with async_session() as session:
            await session.execute(
                Scope.__table__.update().where(Scope.id == scope_id).values(pid=pid)
            )
            await session.commit()
            phase["status"] = "running"
            await self._save_plan(session, run_id, phases, current_phase_id=phase["id"])
            await append_event(
                session,
                run_id=run_id,
                scope_id=scope_id,
                parent_scope_id=None,
                phase_id=uuid.UUID(phase["id"]),
                type_="phase.started",
                payload={"title": phase["title"], "assigned_agent": phase["assigned_agent"]},
            )

    async def _reconcile(self, run_id: uuid.UUID, scope_id: uuid.UUID, phases: list[dict]) -> None:
        async with async_session() as session:
            scope = await session.get(Scope, scope_id)
            assert scope is not None
            phase = _phase_by_id(phases, str(scope.phase_id))
            if phase is None:
                return

            if scope.state == "completed":
                phase["status"] = "completed"
                event_type = "phase.completed"
                logger.info("supervisor: agents.%s (scope=%s) completed", scope.agent_name, scope_id)
            elif scope.state == "stopped":
                # graceful SIGINT checkpoint — leave at "running" (paused);
                # resume finds it by this same status.
                event_type = None
                logger.info(
                    "supervisor: agents.%s (scope=%s) stopped, checkpoint=%s",
                    scope.agent_name, scope_id, scope.checkpoint_path,
                )
            else:
                phase["status"] = "failed"
                event_type = "phase.failed"
                logger.warning(
                    "supervisor: agents.%s (scope=%s) ended in unexpected state %r — marking phase failed",
                    scope.agent_name, scope_id, scope.state,
                )

            await self._save_plan(session, run_id, phases)
            if event_type:
                await append_event(
                    session,
                    run_id=run_id,
                    scope_id=scope_id,
                    parent_scope_id=None,
                    phase_id=scope.phase_id,
                    type_=event_type,
                    payload={"title": phase["title"]},
                )

    async def _save_plan(
        self,
        session: AsyncSession,
        run_id: uuid.UUID,
        phases: list[dict],
        current_phase_id: str | None = None,
    ) -> None:
        run = await session.get(Run, run_id)
        assert run is not None
        run.plan = {"phases": phases}
        if current_phase_id is not None:
            run.current_phase_id = uuid.UUID(current_phase_id)
        await session.commit()

    async def _finish(self, run_id: uuid.UUID, phases: list[dict], final_state: str) -> None:
        logger.info("supervisor: run=%s finishing as %r", run_id, final_state)
        async with async_session() as session:
            run = await session.get(Run, run_id)
            assert run is not None
            run.state = final_state
            run.plan = {"phases": phases}
            if final_state in ("completed", "failed"):
                run.completed_at = datetime.now(timezone.utc)
            await session.commit()

            if final_state == "stopped":
                completed = [p["title"] for p in phases if p["status"] == "completed"]
                summary = (
                    f"Stopped with {len(completed)} of {len(phases)} phases complete "
                    f"({', '.join(completed) or 'none yet'}). Nothing further will run until resumed."
                )
                session.add(
                    Checkpoint(
                        run_id=run_id,
                        seq=run.last_seq,
                        reason="stop",
                        completed_phases=completed,
                        summary_text=summary,
                    )
                )
                await session.commit()
                await append_event(
                    session,
                    run_id=run_id,
                    scope_id=None,
                    parent_scope_id=None,
                    phase_id=None,
                    type_="checkpoint.written",
                    payload={"summary": summary},
                )

            await append_event(
                session,
                run_id=run_id,
                scope_id=None,
                parent_scope_id=None,
                phase_id=None,
                type_="run.state_changed",
                payload={"state": final_state},
            )


manager = RunSupervisorManager()
