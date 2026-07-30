"""Direct Postgres access for agent subprocesses.

Deliberately not SQLAlchemy and not shared with `backend/app/db/`: an agent
process is a short-lived, independently-invoked script (`python -m
agents.runner ...`), not an import-time dependent of the FastAPI app. It
opens exactly one `asyncpg` connection for its whole lifetime and uses it for
both routine progress events and its own SIGINT checkpoint write, see
docs/ARCHITECTURE.md §6.2b for why the agent does this write itself rather
than reporting up to the orchestrator.
"""

import json
import os
import uuid
from typing import Any

import asyncpg

CONNECT_TIMEOUT_S = 5


def _dsn() -> str:
    # The backend's DATABASE_URL is SQLAlchemy-flavored (postgresql+asyncpg://...);
    # asyncpg's own connect() wants a plain postgresql:// DSN.
    url = os.environ.get(
        "DATABASE_URL", "postgresql+asyncpg://brainx:brainx_dev@db:5432/brainx"
    )
    return url.replace("postgresql+asyncpg://", "postgresql://")


async def connect() -> asyncpg.Connection:
    return await asyncpg.connect(_dsn(), timeout=CONNECT_TIMEOUT_S)


async def fetch_scope(conn: asyncpg.Connection, scope_id: uuid.UUID) -> dict[str, Any]:
    row = await conn.fetchrow(
        """
        SELECT run_id, agent_name, phase_id, task_brief, parent_scope_id,
               checkpoint_path, checkpoint_state
        FROM scopes
        WHERE id = $1
        """,
        scope_id,
    )
    if row is None:
        raise LookupError(f"scope {scope_id} not found")
    data = dict(row)
    # asyncpg returns JSONB columns as raw text without a registered codec,
    # decode it here so every caller gets a real dict, not a string that
    # happens to look like one.
    data["task_brief"] = json.loads(data["task_brief"])
    return data


async def insert_event(
    conn: asyncpg.Connection,
    *,
    run_id: uuid.UUID,
    scope_id: uuid.UUID | None,
    parent_scope_id: uuid.UUID | None,
    phase_id: uuid.UUID | None,
    type_: str,
    payload: dict[str, Any],
) -> int:
    """Appends one row to run_events with an atomically-assigned seq, then
    NOTIFYs so the WebSocket layer's LISTEN wakes up and re-queries. Mirrors
    the allocation strategy in docs/DB_SCHEMA.md's `run_events` notes.
    """
    async with conn.transaction():
        seq = await conn.fetchval(
            """
            UPDATE runs SET last_seq = last_seq + 1, updated_at = now()
            WHERE id = $1
            RETURNING last_seq
            """,
            run_id,
        )
        await conn.execute(
            """
            INSERT INTO run_events (run_id, seq, scope_id, parent_scope_id, phase_id, type, payload)
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
            """,
            run_id,
            seq,
            scope_id,
            parent_scope_id,
            phase_id,
            type_,
            json.dumps(payload),
        )
        await conn.execute(
            "SELECT pg_notify('run_events_channel', $1)",
            json.dumps({"run_id": str(run_id), "seq": seq}),
        )
    return seq


async def update_scope_state(
    conn: asyncpg.Connection,
    scope_id: uuid.UUID,
    state: str,
    *,
    summary: str | None = None,
    ended: bool = False,
) -> None:
    await conn.execute(
        """
        UPDATE scopes
        SET state = $2,
            summary = COALESCE($3, summary),
            ended_at = CASE WHEN $4 THEN now() ELSE ended_at END
        WHERE id = $1
        """,
        scope_id,
        state,
        summary,
        ended,
    )


async def write_checkpoint(
    conn: asyncpg.Connection,
    scope_id: uuid.UUID,
    *,
    checkpoint_path: str,
    checkpoint_state: str,
) -> None:
    """The agent's own SIGINT-triggered write, records where it saved its
    state file and marks the scope stopped. See BaseAgent.on_interrupt."""
    await conn.execute(
        """
        UPDATE scopes
        SET checkpoint_path = $2, checkpoint_state = $3, state = 'stopped', ended_at = now()
        WHERE id = $1
        """,
        scope_id,
        checkpoint_path,
        checkpoint_state,
    )
