"""Spawns and tracks one subagent OS subprocess per scope.

`python -m agents.runner` is invoked as a child of this same container (see
docs/ARCHITECTURE.md §6.1 — `agents/` is baked/mounted alongside `app/` at
/app/agents). The only identity passed at spawn is the scope id; the agent
reads its own instructions from its `scopes` row.
"""

from __future__ import annotations

import asyncio
import logging
import signal
import sys
import uuid

logger = logging.getLogger(__name__)

STOP_GRACE_S = 5.0


class AgentProcess:
    def __init__(self, *, scope_id: uuid.UUID, run_id: uuid.UUID) -> None:
        self.scope_id = scope_id
        self.run_id = run_id
        self._process: asyncio.subprocess.Process | None = None

    async def start(self) -> int:
        self._process = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "agents.runner",
            "--scope-id",
            str(self.scope_id),
            "--run-id",
            str(self.run_id),
        )
        assert self._process.pid is not None
        logger.info(
            "agent_process: exec'd `python -m agents.runner --scope-id %s --run-id %s` -> PID %d",
            self.scope_id, self.run_id, self._process.pid,
        )
        return self._process.pid

    async def wait(self) -> int:
        assert self._process is not None
        return await self._process.wait()

    @property
    def returncode(self) -> int | None:
        return None if self._process is None else self._process.returncode

    async def stop(self) -> None:
        """SIGINT, never terminate()/kill() on the happy path — this is what
        lets the agent write its checkpoint before exiting. A grace-timeout
        SIGKILL is the fallback only if it doesn't exit on its own."""
        if self._process is None or self._process.returncode is not None:
            return
        logger.info("agent_process: sending SIGINT to PID %d (scope=%s)", self._process.pid, self.scope_id)
        self._process.send_signal(signal.SIGINT)
        try:
            await asyncio.wait_for(self._process.wait(), timeout=STOP_GRACE_S)
            logger.info("agent_process: PID %d exited cleanly after SIGINT", self._process.pid)
        except asyncio.TimeoutError:
            logger.warning(
                "agent_process: PID %d did not exit within %.0fs of SIGINT — sending SIGKILL",
                self._process.pid, STOP_GRACE_S,
            )
            self._process.kill()
            await self._process.wait()
