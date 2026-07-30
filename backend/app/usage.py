"""Token accounting and cost model.

Two kinds of usage flow through the `usage.recorded` event:

- **measured**, the CMO's planning call reports real `usage` from the
  Anthropic API. This is the only genuinely metered spend in the build.
- **simulated**, the seven subagents are dummy processes that make no LLM
  call at all, so they have no real token usage. They emit plausible
  synthetic counts so the harness has a live cost surface to render. Every
  such event carries `simulated: true` and the UI labels it; see MEMO.md.

Pricing is duplicated in `agents/usage.py` because `agents/` is a standalone
package that imports nothing from `backend/` (see docs/ARCHITECTURE.md §6.1).
The two tables must stay in sync; this one is canonical.
"""

from dataclasses import dataclass, field

MODEL = "claude-opus-5"

# USD per 1M tokens, Claude Opus 5. Cache reads bill at ~0.1x base input,
# 5-minute-TTL cache writes at 1.25x.
PRICE_INPUT_PER_MTOK = 5.00
PRICE_OUTPUT_PER_MTOK = 25.00
PRICE_CACHE_READ_PER_MTOK = 0.50
PRICE_CACHE_WRITE_PER_MTOK = 6.25


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0

    def __add__(self, other: "Usage") -> "Usage":
        return Usage(
            input_tokens=self.input_tokens + other.input_tokens,
            output_tokens=self.output_tokens + other.output_tokens,
            cache_read_tokens=self.cache_read_tokens + other.cache_read_tokens,
            cache_write_tokens=self.cache_write_tokens + other.cache_write_tokens,
        )

    @property
    def total_tokens(self) -> int:
        return (
            self.input_tokens
            + self.output_tokens
            + self.cache_read_tokens
            + self.cache_write_tokens
        )

    @property
    def cost_usd(self) -> float:
        return round(
            self.input_tokens / 1_000_000 * PRICE_INPUT_PER_MTOK
            + self.output_tokens / 1_000_000 * PRICE_OUTPUT_PER_MTOK
            + self.cache_read_tokens / 1_000_000 * PRICE_CACHE_READ_PER_MTOK
            + self.cache_write_tokens / 1_000_000 * PRICE_CACHE_WRITE_PER_MTOK,
            6,
        )

    def as_payload(self, *, source: str, simulated: bool, agent_name: str | None = None) -> dict:
        return {
            "source": source,
            "agent_name": agent_name,
            "model": MODEL,
            "simulated": simulated,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "cache_read_tokens": self.cache_read_tokens,
            "cache_write_tokens": self.cache_write_tokens,
            "total_tokens": self.total_tokens,
            "cost_usd": self.cost_usd,
        }


@dataclass
class PlanUsage:
    """Every attempt the planner made, including failed retries, those bill
    too, so hiding them would understate real spend."""

    attempts: list[Usage] = field(default_factory=list)

    def add(self, usage: Usage) -> None:
        self.attempts.append(usage)

    @property
    def total(self) -> Usage:
        out = Usage()
        for u in self.attempts:
            out = out + u
        return out
