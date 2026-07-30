"""BaseAgent, the shared lifecycle every dummy subagent runs through.

Concrete agents (market_scout.py, etc.) only ever implement `steps()` and
`finish_summary()`, plus optionally `artifacts()`. Everything else,
spawning into a scope, emitting step events with sampled latency, catching
SIGINT cleanly, writing a checkpoint file, and recording that file's path in
Postgres, lives here once. See docs/ARCHITECTURE.md §6.2b for the design
rationale (why `loop.add_signal_handler` and not raw `signal.signal`).
"""

from __future__ import annotations

import asyncio
import json
import os
import signal
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import asyncpg

from agents import db
from agents.fixtures import simulate_work
from agents.usage import simulate_step_usage

Kind = Literal["read", "write", "publish"]
Significance = Literal["routine", "finding", "milestone"]

CHECKPOINT_DIR = os.environ.get("CHECKPOINT_DIR", "/var/lib/brainx/checkpoints")


@dataclass
class StepDef:
    label: str
    kind: Kind
    significance: Significance
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass
class ArtifactDef:
    kind: Literal["strategy_doc", "keyword_table", "post_draft", "outreach_list", "influencer_list"]
    title: str
    format: Literal["markdown", "csv", "json"]
    content: str


class BaseAgent(ABC):
    #: overridden by each concrete agent; must match docs/DB_SCHEMA.md's
    #: scopes.agent_name CHECK constraint.
    AGENT_NAME: str = "base"

    def __init__(
        self,
        *,
        conn: asyncpg.Connection,
        scope_id: uuid.UUID,
        run_id: uuid.UUID,
        phase_id: uuid.UUID | None,
        parent_scope_id: uuid.UUID | None,
    ) -> None:
        self.conn = conn
        self.scope_id = scope_id
        self.run_id = run_id
        self.phase_id = phase_id
        self.parent_scope_id = parent_scope_id
        self._stop_event = asyncio.Event()
        self._completed_labels: list[str] = []
        self._resumed = False

    # ---- hooks concrete agents implement -------------------------------

    @abstractmethod
    def steps(self, instructions: dict[str, Any]) -> list[StepDef]:
        """The canned list of dummy work items this agent performs."""

    @abstractmethod
    def finish_summary(self, instructions: dict[str, Any]) -> str:
        """The one-line collapse shown when this scope completes normally."""

    def artifacts(self, instructions: dict[str, Any]) -> list[ArtifactDef]:
        """Optional canned deliverables. Default: none."""
        return []

    # ---- lifecycle ------------------------------------------------------

    def resume_from(self, checkpoint_path: str) -> None:
        """Rehydrate from the checkpoint this scope wrote when it was last
        SIGINT'd, so `run()` can skip the steps already done instead of
        replaying the whole list. Called before `on_start` by the runner when
        the scope row carries a partial checkpoint.

        A missing or unreadable file is not fatal, the agent just starts
        over, which is the pre-checkpoint behaviour and strictly better than
        crashing the phase.
        """
        try:
            data = json.loads(Path(checkpoint_path).read_text())
        except (OSError, ValueError) as exc:
            print(
                f"[agents.{self.AGENT_NAME}] checkpoint {checkpoint_path} unreadable "
                f"({exc}), restarting this phase from the beginning",
                flush=True,
            )
            return
        self._completed_labels = list(data.get("steps_completed", []))
        self._resumed = True
        print(
            f"[agents.{self.AGENT_NAME}] resuming from checkpoint, "
            f"{len(self._completed_labels)} step(s) already done, skipping them",
            flush=True,
        )

    def install_signal_handler(self, loop: asyncio.AbstractEventLoop) -> None:
        # `loop.add_signal_handler` (not raw `signal.signal`) schedules the
        # callback on the event loop itself, so it's safe to just flip a flag
        # here and let the run loop check it between steps, the same
        # check-at-boundaries principle as the orchestrator's own token
        # cancellation, at process granularity instead of task granularity.
        loop.add_signal_handler(signal.SIGINT, self._stop_event.set)

    async def on_start(self, instructions: dict[str, Any]) -> None:
        print(
            f"[agents.{self.AGENT_NAME}] scope={self.scope_id} run={self.run_id} starting, "
            f"brief={instructions.get('phase_title')!r}",
            flush=True,
        )
        await db.update_scope_state(self.conn, self.scope_id, "running")
        await db.insert_event(
            self.conn,
            run_id=self.run_id,
            scope_id=self.scope_id,
            parent_scope_id=self.parent_scope_id,
            phase_id=self.phase_id,
            type_="scope.spawned",
            payload={"agent_name": self.AGENT_NAME},
        )

    async def step(self, s: StepDef) -> None:
        print(f"[agents.{self.AGENT_NAME}] scope={self.scope_id} step: {s.label}", flush=True)
        await db.insert_event(
            self.conn,
            run_id=self.run_id,
            scope_id=self.scope_id,
            parent_scope_id=self.parent_scope_id,
            phase_id=self.phase_id,
            type_="step.started",
            payload={"label": s.label, "kind": s.kind},
        )
        await simulate_work()
        completed_seq = await db.insert_event(
            self.conn,
            run_id=self.run_id,
            scope_id=self.scope_id,
            parent_scope_id=self.parent_scope_id,
            phase_id=self.phase_id,
            type_="step.completed",
            payload={
                "label": s.label,
                "kind": s.kind,
                "significance": s.significance,
                "result": s.payload,
            },
        )
        if s.significance == "finding":
            await db.insert_event(
                self.conn,
                run_id=self.run_id,
                scope_id=self.scope_id,
                parent_scope_id=self.parent_scope_id,
                phase_id=self.phase_id,
                type_="finding.recorded",
                payload={"label": s.label, "result": s.payload},
            )
        # SIMULATED spend, this agent made no LLM call. Flagged
        # `simulated: true` in the payload; see agents/usage.py and MEMO.md.
        await db.insert_event(
            self.conn,
            run_id=self.run_id,
            scope_id=self.scope_id,
            parent_scope_id=self.parent_scope_id,
            phase_id=self.phase_id,
            type_="usage.recorded",
            payload=simulate_step_usage(self.AGENT_NAME, len(self._completed_labels), s.kind),
        )
        if s.kind in ("read", "write", "publish"):
            # Uses the exact seq `insert_event` just returned rather than
            # re-reading runs.last_seq, with up to 3 subagents writing
            # concurrently on the same run, last_seq can move between our
            # insert and a follow-up read, which would attribute this ledger
            # row to a different scope's event entirely.
            await self.conn.execute(
                """
                INSERT INTO tool_ledger (run_id, seq, kind, target, summary, ts)
                VALUES ($1, $2, $3, $4, $5, now())
                """,
                self.run_id,
                completed_seq,
                s.kind,
                s.payload.get("target", s.label),
                s.label,
            )
        self._completed_labels.append(s.label)

    async def run(self, instructions: dict[str, Any]) -> None:
        # Steps completed before an earlier interrupt are skipped rather than
        # replayed. Matching on label works because each agent's step list is
        # a fixed, unique sequence; a real agent would need durable step ids.
        already_done = set(self._completed_labels) if self._resumed else set()
        for s in self.steps(instructions):
            if s.label in already_done:
                continue
            if self._stop_event.is_set():
                await self.on_interrupt()
                return
            await self.step(s)

        for a in self.artifacts(instructions):
            await self.conn.execute(
                """
                INSERT INTO artifacts (run_id, scope_id, kind, title, format, content)
                VALUES ($1, $2, $3, $4, $5, $6)
                """,
                self.run_id,
                self.scope_id,
                a.kind,
                a.title,
                a.format,
                a.content,
            )
            await db.insert_event(
                self.conn,
                run_id=self.run_id,
                scope_id=self.scope_id,
                parent_scope_id=self.parent_scope_id,
                phase_id=self.phase_id,
                type_="artifact.created",
                payload={"kind": a.kind, "title": a.title},
            )

        await self.on_finish(self.finish_summary(instructions))

    async def on_finish(self, summary: str) -> None:
        print(
            f"[agents.{self.AGENT_NAME}] scope={self.scope_id} finished "
            f"({len(self._completed_labels)} step(s)), exiting",
            flush=True,
        )
        await db.update_scope_state(self.conn, self.scope_id, "completed", summary=summary, ended=True)
        await db.insert_event(
            self.conn,
            run_id=self.run_id,
            scope_id=self.scope_id,
            parent_scope_id=self.parent_scope_id,
            phase_id=self.phase_id,
            type_="scope.completed",
            payload={"summary": summary},
        )

    async def on_interrupt(self) -> None:
        """The SIGINT path: write a state file, point Postgres at it, exit
        cleanly. This is the literal realization of 'save state to a file,
        enter the file name in postgres, and exit gracefully.'"""
        print(
            f"[agents.{self.AGENT_NAME}] scope={self.scope_id} SIGINT received after "
            f"{len(self._completed_labels)} step(s), writing checkpoint and exiting",
            flush=True,
        )
        checkpoint = {
            "scope_id": str(self.scope_id),
            "run_id": str(self.run_id),
            "agent_name": self.AGENT_NAME,
            "steps_completed": self._completed_labels,
            "interrupted_at": datetime.now(timezone.utc).isoformat(),
        }
        run_dir = Path(CHECKPOINT_DIR) / str(self.run_id)
        run_dir.mkdir(parents=True, exist_ok=True)
        checkpoint_path = run_dir / f"{self.scope_id}.json"
        checkpoint_path.write_text(json.dumps(checkpoint, indent=2))

        await db.write_checkpoint(
            self.conn,
            self.scope_id,
            checkpoint_path=str(checkpoint_path),
            checkpoint_state="partial",
        )
        await db.insert_event(
            self.conn,
            run_id=self.run_id,
            scope_id=self.scope_id,
            parent_scope_id=self.parent_scope_id,
            phase_id=self.phase_id,
            type_="scope.summarised",
            payload={
                "summary": f"Stopped by operator after {len(self._completed_labels)} step(s).",
                "partial": True,
                "checkpoint_path": str(checkpoint_path),
            },
        )
