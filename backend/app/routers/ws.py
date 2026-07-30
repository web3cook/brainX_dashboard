"""GET /runs/{id}/live — the one WebSocket, replacing the original SSE design
(docs/ARCHITECTURE.md §2, §7). Carries the live run_events stream plus chat
both ways. Backfills via the same seq-based query the REST
`/events?since=` endpoint uses, then tails live via the Postgres
LISTEN/NOTIFY fanout in `event_bus`.

Chat replies are templated, not a second live Claude call — the one real
LLM call in this build pass is the CMO's planning call
(`app/planner/cmo_planner.py`); see docs/ARCHITECTURE.md §9's noted scope
for this pass.
"""

import asyncio
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import text

from app.db.base import async_session
from app.orchestrator.event_bus import append_event, event_bus

router = APIRouter(tags=["ws"])

CMO_REPLY_DELAY_S = 0.9
CMO_REPLIES = [
    "On it. I'll brief the right agents and hold anything publishable for your approval.",
    "Noted — I'll factor that in for the next phase boundary.",
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


def _serialize_event(row: dict) -> dict:
    return {k: _json_safe(v) for k, v in row.items()}


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


async def _send_events(websocket: WebSocket, events: list[dict]) -> int:
    last_seq = 0
    for row in events:
        await websocket.send_json({"type": "event", "event": _serialize_event(row)})
        if row["type"] == "run.state_changed":
            await websocket.send_json(
                {"type": "run.state", "state": row["payload"].get("state")}
            )
        last_seq = row["seq"]
    return last_seq


async def _cmo_reply(run_id: uuid.UUID, turn: int) -> None:
    await asyncio.sleep(CMO_REPLY_DELAY_S)
    text_reply = CMO_REPLIES[turn % len(CMO_REPLIES)]
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


@router.websocket("/runs/{run_id}/live")
async def run_live(websocket: WebSocket, run_id: uuid.UUID) -> None:
    since = int(websocket.query_params.get("since", 0))
    await websocket.accept()

    queue = event_bus.subscribe(run_id)
    turn = 0
    try:
        last_sent = await _send_events(websocket, await _fetch_events_since(run_id, since))
        last_sent = max(last_sent, since)

        async def reader() -> None:
            nonlocal turn
            while True:
                data = await websocket.receive_json()
                if data.get("type") == "chat.message":
                    body = str(data.get("body", ""))
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
                    asyncio.create_task(_cmo_reply(run_id, turn))
                    turn += 1
                # any other inbound type is ignored by design — stop/resume/
                # approvals/queued messages are REST-only, never WS frames.

        async def writer() -> None:
            nonlocal last_sent
            while True:
                await queue.get()
                events = await _fetch_events_since(run_id, last_sent)
                if events:
                    last_sent = await _send_events(websocket, events)

        reader_task = asyncio.create_task(reader())
        writer_task = asyncio.create_task(writer())
        try:
            # Either side ending — a client disconnect surfaces as
            # `receive_json`/`send_json` raising on whichever task is
            # mid-call — means the connection is done; stop both cleanly
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
        # disconnect races an in-flight push — both mean the client is gone.
        pass
    finally:
        event_bus.unsubscribe(run_id, queue)
