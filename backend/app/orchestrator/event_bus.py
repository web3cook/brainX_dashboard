"""Event append + Postgres LISTEN/NOTIFY fanout.

`append_event` mirrors `agents/db.py::insert_event` exactly (same atomic
seq-allocation pattern) but through the backend's own SQLAlchemy session —
the backend and the agent subprocesses each own their side of the same
`run_events` table, never importing each other's code.

`EventBus` holds one dedicated asyncpg connection for LISTEN (a pooled
SQLAlchemy connection can't stay subscribed) and fans NOTIFY payloads out to
whichever WebSocket connections are currently subscribed to that run.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from collections import defaultdict
from typing import Any

import asyncpg
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings

CHANNEL = "run_events_channel"


async def append_event(
    session: AsyncSession,
    *,
    run_id: uuid.UUID,
    scope_id: uuid.UUID | None,
    parent_scope_id: uuid.UUID | None,
    phase_id: uuid.UUID | None,
    type_: str,
    payload: dict[str, Any],
) -> int:
    seq = (
        await session.execute(
            text(
                "UPDATE runs SET last_seq = last_seq + 1, updated_at = now() "
                "WHERE id = :run_id RETURNING last_seq"
            ),
            {"run_id": run_id},
        )
    ).scalar_one()

    await session.execute(
        text(
            """
            INSERT INTO run_events (run_id, seq, scope_id, parent_scope_id, phase_id, type, payload)
            VALUES (:run_id, :seq, :scope_id, :parent_scope_id, :phase_id, :type_, CAST(:payload AS jsonb))
            """
        ),
        {
            "run_id": run_id,
            "seq": seq,
            "scope_id": scope_id,
            "parent_scope_id": parent_scope_id,
            "phase_id": phase_id,
            "type_": type_,
            "payload": json.dumps(payload),
        },
    )
    await session.execute(
        text("SELECT pg_notify(:channel, :payload)"),
        {"channel": CHANNEL, "payload": json.dumps({"run_id": str(run_id), "seq": seq})},
    )
    await session.commit()
    return seq


class EventBus:
    """App-lifetime singleton: one LISTEN connection, in-process fanout."""

    def __init__(self) -> None:
        self._conn: asyncpg.Connection | None = None
        self._subscribers: dict[uuid.UUID, set[asyncio.Queue]] = defaultdict(set)

    async def start(self) -> None:
        dsn = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
        self._conn = await asyncpg.connect(dsn)
        await self._conn.add_listener(CHANNEL, self._on_notify)

    async def stop(self) -> None:
        if self._conn is not None:
            await self._conn.remove_listener(CHANNEL, self._on_notify)
            await self._conn.close()
            self._conn = None

    def _on_notify(self, _connection: Any, _pid: int, _channel: str, payload: str) -> None:
        data = json.loads(payload)
        run_id = uuid.UUID(data["run_id"])
        for queue in self._subscribers.get(run_id, ()):
            queue.put_nowait(int(data["seq"]))

    def subscribe(self, run_id: uuid.UUID) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        self._subscribers[run_id].add(queue)
        return queue

    def unsubscribe(self, run_id: uuid.UUID, queue: asyncio.Queue) -> None:
        self._subscribers[run_id].discard(queue)


event_bus = EventBus()
