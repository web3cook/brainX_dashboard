"""CLI entrypoint for every dummy subagent process.

Invoked by the orchestrator as:

    python -m agents.runner --scope-id <uuid> --run-id <uuid>

The only identity passed in is the scope id; the agent reads its own
`task_brief` and `agent_name` from its `scopes` row (docs/ARCHITECTURE.md
§6.2, "instructions delivery"). Can also be invoked directly for manual
testing — see docs/DB_SCHEMA.md / the build-order milestone that proves this
lifecycle standalone before anything else is wired to it.
"""

import argparse
import asyncio
import os
import sys
import uuid

from agents import db
from agents.base import BaseAgent
from agents.community_scout import CommunityScoutAgent
from agents.content_writer import ContentWriterAgent
from agents.influencer import InfluencerAgent
from agents.linkedin_scout import LinkedinScoutAgent
from agents.market_scout import MarketScoutAgent
from agents.seo_geo_analyst import SeoGeoAnalystAgent
from agents.x_scout import XScoutAgent

AGENT_REGISTRY: dict[str, type[BaseAgent]] = {
    cls.AGENT_NAME: cls
    for cls in (
        MarketScoutAgent,
        SeoGeoAnalystAgent,
        CommunityScoutAgent,
        XScoutAgent,
        LinkedinScoutAgent,
        ContentWriterAgent,
        InfluencerAgent,
    )
}


async def main() -> int:
    parser = argparse.ArgumentParser(description="Run one dummy subagent invocation.")
    parser.add_argument("--scope-id", required=True, type=uuid.UUID)
    parser.add_argument("--run-id", required=True, type=uuid.UUID)
    args = parser.parse_args()

    print(f"[agents.runner] booting for scope={args.scope_id} run={args.run_id} (PID {os.getpid()})", flush=True)
    conn = await db.connect()
    try:
        scope = await db.fetch_scope(conn, args.scope_id)
        agent_cls = AGENT_REGISTRY.get(scope["agent_name"])
        if agent_cls is None:
            print(f"unknown agent_name: {scope['agent_name']!r}", file=sys.stderr, flush=True)
            return 1
        print(f"[agents.runner] resolved agent_name={scope['agent_name']!r} -> {agent_cls.__name__}", flush=True)

        agent = agent_cls(
            conn=conn,
            scope_id=args.scope_id,
            run_id=args.run_id,
            phase_id=scope["phase_id"],
            parent_scope_id=scope["parent_scope_id"],
        )

        loop = asyncio.get_running_loop()
        agent.install_signal_handler(loop)

        instructions = scope["task_brief"]
        await agent.on_start(instructions)
        await agent.run(instructions)
        return 0
    finally:
        await conn.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
