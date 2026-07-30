"""GET /live, the one WebSocket, replacing the original SSE design
(docs/ARCHITECTURE.md §2, §7) and the earlier per-run socket.

**One connection per operator session, not per run.** The client opens this
once when the dashboard mounts and keeps it for the whole session,
multiplexing every run it cares about over it via `subscribe`/`unsubscribe`
frames. Switching runs no longer tears down and re-establishes a socket,
it's a frame on the existing one. Outbound frames always carry `run_id` so
the client can route them.

Backfill uses the same seq-based query the REST `/events?since=` endpoint
uses, then the connection tails live via the Postgres LISTEN/NOTIFY fanout
in `event_bus`.

Chat replies are not a second live Claude call, the one real LLM call in
this build pass is the CMO's planning call (`app/planner/cmo_planner.py`).
`_compose_reply` answers the questions that are exactly answerable from the
DB ("what's live", "what's the plan", "status") for real; genuinely
open-ended chat falls back to a templated cycle.
"""

import asyncio
import logging
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import text

from app.db.base import async_session
from app.orchestrator.event_bus import append_event, event_bus

logger = logging.getLogger(__name__)

router = APIRouter(tags=["ws"])

CMO_REPLY_DELAY_S = 0.9
CMO_REPLIES = [
    "On it. I'll brief the right agents and hold anything publishable for your approval.",
    "Noted, I'll factor that in for the next phase boundary.",
    "Understood. I'll keep going and flag anything that needs your sign-off.",
]


def _json_safe(value: Any) -> Any:
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    return value


async def _fetch_events_since(run_id: uuid.UUID, since: int) -> list[dict]:
    async with async_session() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT run_id, seq, ts, scope_id, parent_scope_id, phase_id, type, payload "
                    "FROM run_events WHERE run_id = :run_id AND seq > :since ORDER BY seq"
                ),
                {"run_id": run_id, "since": since},
            )
        ).mappings()
        return [dict(r) for r in rows]


async def _live_status_reply(session, run_id: uuid.UUID, run_state: str) -> str:
    rows = (
        await session.execute(
            text("SELECT agent_name, state FROM scopes WHERE run_id = :run_id ORDER BY started_at"),
            {"run_id": run_id},
        )
    ).mappings().all()
    if run_state == "awaiting_plan_approval":
        return "Nothing's running yet, the plan is still waiting on your approval."
    if not rows:
        return f"Run is {run_state}, no agents have been dispatched yet."
    live = [r["agent_name"] for r in rows if r["state"] == "running"]
    done = [r["agent_name"] for r in rows if r["state"] == "completed"]
    if live:
        return (
            f"{len(live)} live right now: {', '.join(a.replace('_', ' ') for a in live)}. "
            f"{len(done)} of {len(rows)} agent run(s) done so far."
        )
    if run_state == "completed":
        return f"All done, {len(done)} of {len(rows)} agent run(s) completed."
    return f"Nothing actively running this second. {len(done)} of {len(rows)} agent run(s) completed so far."


async def _plan_status_reply(session, run_id: uuid.UUID) -> str:
    row = (
        await session.execute(text("SELECT plan FROM runs WHERE id = :run_id"), {"run_id": run_id})
    ).mappings().first()
    phases = ((row and row["plan"]) or {}).get("phases", [])
    if not phases:
        return "No plan yet, send a brief and I'll put one together."
    counts: dict[str, int] = {}
    for p in phases:
        counts[p["status"]] = counts.get(p["status"], 0) + 1
    breakdown = ", ".join(f"{n} {status}" for status, n in counts.items())
    return f"{len(phases)} phases planned, {breakdown}."


async def _compose_reply(run_id: uuid.UUID, body: str, turn: int) -> str:
    lowered = body.lower()
    async with async_session() as session:
        run_row = (
            await session.execute(text("SELECT state FROM runs WHERE id = :run_id"), {"run_id": run_id})
        ).mappings().first()
        run_state = run_row["state"] if run_row else "unknown"

        if any(k in lowered for k in ("live", "running", "status")):
            return await _live_status_reply(session, run_id, run_state)
        if "plan" in lowered:
            return await _plan_status_reply(session, run_id)

    # Genuinely open-ended chat has no real answer to compute, this is the
    # one place still templated rather than backed by a real LLM call.
    return CMO_REPLIES[turn % len(CMO_REPLIES)]


async def _cmo_reply(run_id: uuid.UUID, turn: int, body: str) -> None:
    await asyncio.sleep(CMO_REPLY_DELAY_S)
    text_reply = await _compose_reply(run_id, body, turn)
    logger.info("ws: chat.reply run=%s -> %r", run_id, text_reply)
    async with async_session() as session:
        await append_event(
            session,
            run_id=run_id,
            scope_id=None,
            parent_scope_id=None,
            phase_id=None,
            type_="chat.reply",
            payload={"who": "CMO", "text": text_reply},
        )


class _Connection:
    """Per-socket state: one queue fed by every subscribed run, and the
    high-water seq already sent for each."""

    def __init__(self, websocket: WebSocket) -> None:
        self.websocket = websocket
        self.queue: asyncio.Queue = asyncio.Queue()
        self.last_sent: dict[uuid.UUID, int] = {}
        # Backfill (driven by the reader on subscribe) and live tailing
        # (driven by the writer) can both want to send at once; without this
        # they could interleave two runs' frames mid-flush.
        self.send_lock = asyncio.Lock()

    async def flush(self, run_id: uuid.UUID) -> None:
        async with self.send_lock:
            since = self.last_sent.get(run_id, 0)
            rows = await _fetch_events_since(run_id, since)
            for row in rows:
                await self.websocket.send_json(
                    {
                        "type": "event",
                        "run_id": str(run_id),
                        "event": {k: _json_safe(v) for k, v in row.items()},
                    }
                )
                self.last_sent[run_id] = row["seq"]

    async def subscribe(self, run_id: uuid.UUID, since: int) -> None:
        self.last_sent[run_id] = since
        event_bus.attach(run_id, self.queue)
        async with self.send_lock:
            await self.websocket.send_json({"type": "subscribed", "run_id": str(run_id)})
        await self.flush(run_id)

    def unsubscribe(self, run_id: uuid.UUID) -> None:
        event_bus.detach(run_id, self.queue)
        self.last_sent.pop(run_id, None)

    def close_all(self) -> None:
        for run_id in list(self.last_sent):
            event_bus.detach(run_id, self.queue)
        self.last_sent.clear()


@router.websocket("/live")
async def live(websocket: WebSocket) -> None:
    await websocket.accept()
    conn = _Connection(websocket)
    turn = 0
    logger.info("ws: session connected")

    try:

        async def reader() -> None:
            nonlocal turn
            while True:
                data = await websocket.receive_json()
                kind = data.get("type")

                if kind == "subscribe":
                    run_id = uuid.UUID(str(data["run_id"]))
                    since = int(data.get("since", 0))
                    logger.info("ws: subscribe run=%s since=%d", run_id, since)
                    await conn.subscribe(run_id, since)

                elif kind == "unsubscribe":
                    run_id = uuid.UUID(str(data["run_id"]))
                    logger.info("ws: unsubscribe run=%s", run_id)
                    conn.unsubscribe(run_id)

                elif kind == "chat.message":
                    run_id = uuid.UUID(str(data["run_id"]))
                    body = str(data.get("body", ""))
                    logger.info("ws: chat.message run=%s -> %r", run_id, body)
                    async with async_session() as session:
                        await append_event(
                            session,
                            run_id=run_id,
                            scope_id=None,
                            parent_scope_id=None,
                            phase_id=None,
                            type_="chat.message",
                            payload={"who": "YOU", "text": body},
                        )
                    asyncio.create_task(_cmo_reply(run_id, turn, body))
                    turn += 1

                # Anything else is ignored by design, stop/resume/approvals/
                # queued messages are REST-only, never WS frames.

        async def writer() -> None:
            while True:
                run_id, _seq = await conn.queue.get()
                if run_id in conn.last_sent:
                    await conn.flush(run_id)

        reader_task = asyncio.create_task(reader())
        writer_task = asyncio.create_task(writer())
        try:
            # Either side ending, a client disconnect surfaces as
            # `receive_json`/`send_json` raising on whichever task is
            # mid-call, means the connection is done; stop both cleanly
            # instead of leaving one task to crash into the logs later.
            done, pending = await asyncio.wait(
                {reader_task, writer_task}, return_when=asyncio.FIRST_COMPLETED
            )
            for task in pending:
                task.cancel()
            for task in done:
                exc = task.exception()
                if exc is not None and not isinstance(exc, WebSocketDisconnect):
                    raise exc
        finally:
            reader_task.cancel()
            writer_task.cancel()
    except (WebSocketDisconnect, RuntimeError):
        # RuntimeError covers Starlette's "send after close" when a
        # disconnect races an in-flight push, both mean the client is gone.
        pass
    finally:
        conn.close_all()
        logger.info("ws: session disconnected")
