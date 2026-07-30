"""The CMO's one real Claude call. `propose_plan` is the only entry point the
orchestrator ever calls — the API call, retry-on-validation-failure, and
template fallback all live inside it, so a future templated-only
implementation could replace the body without touching the orchestrator.
"""

import logging

import anthropic
from pydantic import ValidationError

from app.config import settings
from app.planner.prompts import SYSTEM_PROMPT, initial_prompt, retry_prompt
from app.planner.schemas import MAX_PHASES, MIN_PHASES, Plan, PlanDraft, materialize

logger = logging.getLogger(__name__)

MODEL = "claude-opus-5"
MAX_TOKENS = 4096


class PlannerError(Exception):
    pass


def _client() -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)


async def _call_claude(user_prompt: str) -> PlanDraft:
    client = _client()
    response = await client.messages.parse(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        # SYSTEM_PROMPT is identical on every call (same roster, same
        # instructions) — only the user turn (brief + autonomy_mode) varies.
        # Caching it here means every plan/replan after the first pays ~0.1x
        # for this prefix instead of full price. See docs/API.md's note on
        # the one real LLM call in this build for context.
        system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user_prompt}],
        output_format=PlanDraft,
    )
    logger.info(
        "cmo_planner: usage input=%d cache_read=%d cache_write=%d output=%d",
        response.usage.input_tokens,
        response.usage.cache_read_input_tokens or 0,
        response.usage.cache_creation_input_tokens or 0,
        response.usage.output_tokens,
    )

    if response.stop_reason == "refusal":
        raise PlannerError("the model declined to plan this brief")

    draft = response.parsed_output
    if draft is None:
        raise PlannerError("model response did not parse to a valid plan")

    if not (MIN_PHASES <= len(draft.phases) <= MAX_PHASES):
        raise PlannerError(
            f"plan had {len(draft.phases)} phases; must be between {MIN_PHASES} and {MAX_PHASES}"
        )

    return draft


def _template_plan() -> PlanDraft:
    """Fixed fallback used only if the real call fails twice in a row."""
    return PlanDraft.model_validate(
        {
            "phases": [
                {
                    "title": "Understand the market",
                    "intent": "Research competitors and find a positioning gap before writing anything.",
                    "assigned_agent": "market_scout",
                    "expected_outputs": ["competitor_summary", "positioning_gap"],
                    "est_steps": 5,
                    "depends_on": [],
                },
                {
                    "title": "Close the SEO gap",
                    "intent": "Find and act on the highest-value keyword and citation gaps.",
                    "assigned_agent": "seo_geo_analyst",
                    "expected_outputs": ["keyword_table"],
                    "est_steps": 5,
                    "depends_on": [],
                },
                {
                    "title": "Draft launch content",
                    "intent": "Turn the research into a first round of on-brand drafts.",
                    "assigned_agent": "content_writer",
                    "expected_outputs": ["post_draft"],
                    "est_steps": 4,
                    "depends_on": ["Understand the market"],
                },
            ]
        }
    )


async def propose_plan(brief: str, autonomy_mode: str) -> Plan:
    try:
        draft = await _call_claude(initial_prompt(brief, autonomy_mode))
    except (PlannerError, ValidationError, anthropic.APIError) as first_error:
        logger.warning("planner call failed, retrying once: %s", first_error)
        try:
            draft = await _call_claude(
                retry_prompt(brief, autonomy_mode, str(first_error))
            )
        except (PlannerError, ValidationError, anthropic.APIError) as second_error:
            logger.warning(
                "planner retry also failed, falling back to template: %s", second_error
            )
            draft = _template_plan()

    return materialize(draft)
