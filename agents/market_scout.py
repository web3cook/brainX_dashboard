"""Market Scout, dummy stand-in for `research.*`.

Real version (not built this pass): competitor and market research, positioning
gaps. This version returns canned findings with sampled latency so the
timeline animates like real work, per docs/ARCHITECTURE.md §8.
"""

from typing import Any

from agents.base import ArtifactDef, BaseAgent, StepDef


class MarketScoutAgent(BaseAgent):
    AGENT_NAME = "market_scout"

    def steps(self, instructions: dict[str, Any]) -> list[StepDef]:
        return [
            StepDef(
                label="Reading the competitor list from the brief",
                kind="read",
                significance="routine",
                payload={"target": "brief.competitors"},
            ),
            StepDef(
                label="Reading Acme's pricing page",
                kind="read",
                significance="routine",
                payload={"target": "https://acme.com/pricing"},
            ),
            StepDef(
                label="Reading Widgetly's positioning page",
                kind="read",
                significance="routine",
                payload={"target": "https://widgetly.io/product"},
            ),
            StepDef(
                label="4 competitors surveyed, all under-serving mid-market compliance",
                kind="read",
                significance="finding",
                payload={
                    "competitors": ["Acme", "Widgetly", "Northbeam", "Fluxa"],
                    "gap": "mid-market compliance / audit-trail features",
                },
            ),
            StepDef(
                label="Drafting a positioning gap summary",
                kind="write",
                significance="milestone",
                payload={"artifact": "strategy_doc"},
            ),
        ]

    def finish_summary(self, instructions: dict[str, Any]) -> str:
        return (
            "Surveyed 4 competitors: all are under-serving mid-market compliance needs. "
            "Recommend leading with audit-trail and approval-history messaging."
        )

    def artifacts(self, instructions: dict[str, Any]) -> list[ArtifactDef]:
        return [
            ArtifactDef(
                kind="strategy_doc",
                title="Competitor positioning gap, mid-market compliance",
                format="markdown",
                content=(
                    "# Positioning gap analysis\n\n"
                    "Surveyed: Acme, Widgetly, Northbeam, Fluxa.\n\n"
                    "None of the four surface audit trails or approval history "
                    "prominently in their marketing. Recommend leading launch "
                    "messaging with those two capabilities for the mid-market "
                    "compliance buyer.\n"
                ),
            )
        ]
