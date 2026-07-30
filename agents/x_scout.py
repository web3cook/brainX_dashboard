"""X Scout — dummy stand-in for `social.*`.

Real version (not built this pass): people worth connecting with on X,
plus posts and replies for that platform specifically.
"""

from typing import Any

from agents.base import ArtifactDef, BaseAgent, StepDef


class XScoutAgent(BaseAgent):
    AGENT_NAME = "x_scout"

    def steps(self, instructions: dict[str, Any]) -> list[StepDef]:
        return [
            StepDef(
                label="Searching dev-tool creators on X",
                kind="read",
                significance="routine",
                payload={"target": "x.search"},
            ),
            StepDef(
                label="Found 9 relevant accounts, ranked by audience overlap",
                kind="read",
                significance="finding",
                payload={"count": 9, "ranked_by": "audience_overlap"},
            ),
            StepDef(
                label="Cutting a 6-post launch thread from the release notes",
                kind="write",
                significance="routine",
                payload={"target": "x.thread_draft"},
            ),
            StepDef(
                label="Hook variant B scored higher in the internal test",
                kind="write",
                significance="finding",
                payload={"variant": "B", "reason": "stronger open-loop hook"},
            ),
        ]

    def finish_summary(self, instructions: dict[str, Any]) -> str:
        return (
            "Ranked 9 X accounts worth contacting by audience overlap, and drafted a "
            "6-post launch thread (hook variant B tested stronger). Nothing posted "
            "without your approval."
        )

    def artifacts(self, instructions: dict[str, Any]) -> list[ArtifactDef]:
        return [
            ArtifactDef(
                kind="outreach_list",
                title="X accounts worth contacting — ranked by audience overlap",
                format="csv",
                content=(
                    "handle,audience_overlap,note\n"
                    "@devtoolsdaily,high,covers typed API tooling regularly\n"
                    "@api_curious,medium,smaller but highly engaged audience\n"
                ),
            )
        ]
