"""Shared dummy-data helpers for agent processes.

Per-role canned findings live directly in each agent file (`market_scout.py`
etc.), they're short, readable lists of strings, not worth a data-table
indirection layer for a skeleton. This module only holds what's genuinely
shared: the latency sampler that makes dummy work animate like real work,
per docs/ARCHITECTURE.md §8's fixture-layer design (300-2500ms, sampled).
"""

import asyncio
import random

LATENCY_MIN_S = 0.3
LATENCY_MAX_S = 2.5


async def simulate_work(min_s: float = LATENCY_MIN_S, max_s: float = LATENCY_MAX_S) -> None:
    await asyncio.sleep(random.uniform(min_s, max_s))
