"""Plan/Phase shapes — the LLM-facing draft the model fills in, and the
materialized Plan the orchestrator actually consumes. Kept as two models
rather than one: the draft asks the model for only what it can reasonably
supply (a title-based `depends_on`, no id, no status); the orchestrator then
assigns real UUIDs and initial status, matching the `Phase(id, title, intent,
assigned_agent, expected_outputs, est_steps, depends_on, status)` shape from
docs/ARCHITECTURE.md §3.2 exactly.
"""

import uuid
from typing import Literal

from pydantic import BaseModel, Field

AgentName = Literal[
    "market_scout",
    "seo_geo_analyst",
    "community_scout",
    "x_scout",
    "linkedin_scout",
    "content_writer",
    "influencer",
]

MIN_PHASES = 3
MAX_PHASES = 7


class PhaseDraft(BaseModel):
    title: str
    intent: str
    assigned_agent: AgentName
    expected_outputs: list[str]
    est_steps: int
    # References earlier phases in this same plan **by title** — simpler for
    # the model to produce correctly than inventing and cross-referencing ids.
    depends_on: list[str] = Field(default_factory=list)


class PlanDraft(BaseModel):
    phases: list[PhaseDraft]


class Phase(BaseModel):
    id: uuid.UUID
    title: str
    intent: str
    assigned_agent: AgentName
    expected_outputs: list[str]
    est_steps: int
    depends_on: list[uuid.UUID]
    status: Literal["pending", "running", "completed", "skipped", "failed"]


class Plan(BaseModel):
    phases: list[Phase]


def materialize(draft: PlanDraft) -> Plan:
    """Assigns real ids and resolves title-based depends_on into id-based."""
    title_to_id = {p.title: uuid.uuid4() for p in draft.phases}
    phases = [
        Phase(
            id=title_to_id[p.title],
            title=p.title,
            intent=p.intent,
            assigned_agent=p.assigned_agent,
            expected_outputs=p.expected_outputs,
            est_steps=p.est_steps,
            depends_on=[title_to_id[t] for t in p.depends_on if t in title_to_id],
            status="pending",
        )
        for p in draft.phases
    ]
    return Plan(phases=phases)
