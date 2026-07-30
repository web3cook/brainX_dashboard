"""Influencer, dummy stand-in for `influencer.*`.

Real version (not built this pass): finds influencers relevant to the
product and drafts collaboration/partnership outreach notes for them.
"""

from typing import Any

from agents.base import ArtifactDef, BaseAgent, StepDef


class InfluencerAgent(BaseAgent):
    AGENT_NAME = "influencer"

    def steps(self, instructions: dict[str, Any]) -> list[StepDef]:
        return [
            StepDef(
                label="Scanning dev-tool YouTube and newsletter creators",
                kind="read",
                significance="routine",
                payload={"target": "influencer.search"},
            ),
            StepDef(
                label="Found 7 creators whose audience matches our ICP",
                kind="read",
                significance="finding",
                payload={"count": 7, "ranked_by": "icp_match"},
            ),
            StepDef(
                label="Drafting a partnership pitch template",
                kind="write",
                significance="routine",
                payload={"target": "influencer.pitch_draft"},
            ),
            StepDef(
                label="Pitch draft complete, tailored openers for the top 3 creators",
                kind="write",
                significance="milestone",
                payload={"tailored_openers": 3},
            ),
        ]

    def finish_summary(self, instructions: dict[str, Any]) -> str:
        return (
            "Found 7 creators whose audience matches our ICP, and drafted a partnership "
            "pitch template with tailored openers for the top 3. Nothing sent without "
            "your approval."
        )

    def artifacts(self, instructions: dict[str, Any]) -> list[ArtifactDef]:
        return [
            ArtifactDef(
                kind="influencer_list",
                title="Influencers worth partnering with, ranked by ICP match",
                format="csv",
                content=(
                    "name,platform,icp_match,note\n"
                    "devtoolreviews,YouTube,high,reviews API tooling weekly for a builder audience\n"
                    "the-shipping-list,Newsletter,high,12k subs, mostly backend engineers\n"
                    "apiwithraj,YouTube,medium,smaller channel but very engaged comments\n"
                ),
            )
        ]
