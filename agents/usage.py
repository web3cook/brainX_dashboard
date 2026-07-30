"""SIMULATED token accounting for the dummy subagents.

These agents make **no LLM call at all**, they run a canned step list and
return fixture data. They therefore burn zero real tokens. What this module
produces is synthetic-but-plausible usage so the harness has a live cost
surface to render while a run is in flight.

Every event this feeds carries `simulated: true`, and the dashboard labels
those figures as simulated. This is disclosed in MEMO.md. Do not read these
numbers as real spend, the only measured usage in the build is the CMO's
planning call (`backend/app/usage.py`, `simulated: false`).

Pricing mirrors `backend/app/usage.py`, which is canonical; the duplication
exists because `agents/` imports nothing from `backend/` (docs/ARCHITECTURE.md
§6.1). Keep the two tables in sync.
"""

import random

MODEL = "claude-opus-5"

PRICE_INPUT_PER_MTOK = 5.00
PRICE_OUTPUT_PER_MTOK = 25.00
PRICE_CACHE_READ_PER_MTOK = 0.50
PRICE_CACHE_WRITE_PER_MTOK = 6.25

# A subagent's context grows as it works, so later steps read more than early
# ones; `write` steps emit meaningfully more output than `read` steps.
_BASE_INPUT = 900
_INPUT_GROWTH_PER_STEP = 420
_OUTPUT_BY_KIND = {"read": (120, 380), "write": (400, 1100), "publish": (200, 500)}


def compute_cost(
    input_tokens: int, output_tokens: int, cache_read_tokens: int, cache_write_tokens: int
) -> float:
    return round(
        input_tokens / 1_000_000 * PRICE_INPUT_PER_MTOK
        + output_tokens / 1_000_000 * PRICE_OUTPUT_PER_MTOK
        + cache_read_tokens / 1_000_000 * PRICE_CACHE_READ_PER_MTOK
        + cache_write_tokens / 1_000_000 * PRICE_CACHE_WRITE_PER_MTOK,
        6,
    )


def simulate_step_usage(agent_name: str, step_index: int, kind: str) -> dict:
    """Synthetic usage for one dummy step. Returns a `usage.recorded` payload."""
    grown = _BASE_INPUT + step_index * _INPUT_GROWTH_PER_STEP
    fresh_input = random.randint(int(grown * 0.15), int(grown * 0.35))
    # Everything the agent already established this run reads from cache on
    # the next step, mirrors how a real agent loop bills after turn one.
    cache_read = 0 if step_index == 0 else grown - fresh_input
    cache_write = grown - fresh_input if step_index == 0 else 0
    lo, hi = _OUTPUT_BY_KIND.get(kind, (150, 450))
    output = random.randint(lo, hi)

    cost = compute_cost(fresh_input, output, cache_read, cache_write)
    return {
        "source": "agent",
        "agent_name": agent_name,
        "model": MODEL,
        "simulated": True,
        "input_tokens": fresh_input,
        "output_tokens": output,
        "cache_read_tokens": cache_read,
        "cache_write_tokens": cache_write,
        "total_tokens": fresh_input + output + cache_read + cache_write,
        "cost_usd": cost,
    }
