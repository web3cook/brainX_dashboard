"""Linkedin Scout — dummy stand-in for `social.*`.

Real version (not built this pass): people worth connecting with on
LinkedIn, plus posts and replies for that platform specifically.
"""

from typing import Any

from agents.base import ArtifactDef, BaseAgent, StepDef


class LinkedinScoutAgent(BaseAgent):
    AGENT_NAME = "linkedin_scout"

    def steps(self, instructions: dict[str, Any]) -> list[StepDef]:
        return [
            StepDef(
                label="Searching dev-tool operators on LinkedIn",
                kind="read",
                significance="routine",
                payload={"target": "linkedin.search"},
            ),
            StepDef(
                label="Found 11 relevant profiles, ranked by audience overlap",
                kind="read",
                significance="finding",
                payload={"count": 11, "ranked_by": "audience_overlap"},
            ),
            StepDef(
                label="Drafting a launch announcement post for LinkedIn",
                kind="write",
                significance="routine",
                payload={"target": "linkedin.post_draft"},
            ),
            StepDef(
                label="Draft complete — 280 words, native tone (not a press release)",
                kind="write",
                significance="milestone",
                payload={"words": 280},
            ),
        ]

    def finish_summary(self, instructions: dict[str, Any]) -> str:
        return (
            "Ranked 11 LinkedIn profiles worth contacting by audience overlap, and drafted "
            "a 280-word launch post in a native (non-press-release) tone. Nothing posted "
            "without your approval."
        )

    def artifacts(self, instructions: dict[str, Any]) -> list[ArtifactDef]:
        return [
            ArtifactDef(
                kind="outreach_list",
                title="LinkedIn profiles worth contacting — ranked by audience overlap",
                format="csv",
                content=(
                    "name,headline,audience_overlap,note\n"
                    "sarah-writes-code,Staff Eng @ devtools co,high,audience matches our ICP closely\n"
                    "raj-buildsapis,API Platform Lead,medium,active poster on API design\n"
                ),
            )
        ]
