"""Content Writer — dummy stand-in for `content.*`.

Real version (not built this pass): drafts SEO-optimised articles anchored
on the keyword/citation gaps the SEO/GEO Analyst finds.
"""

from typing import Any

from agents.base import ArtifactDef, BaseAgent, StepDef


class ContentWriterAgent(BaseAgent):
    AGENT_NAME = "content_writer"

    def steps(self, instructions: dict[str, Any]) -> list[StepDef]:
        return [
            StepDef(
                label="Loading brand voice profile from past posts",
                kind="read",
                significance="routine",
                payload={"target": "voice_profile"},
            ),
            StepDef(
                label="Outlining an SEO article targeting the top keyword gap",
                kind="write",
                significance="routine",
                payload={"target": "draft_1"},
            ),
            StepDef(
                label="Draft 1 complete — 1,240 words, targets \"typed api client\"",
                kind="write",
                significance="milestone",
                payload={"draft": 1, "words": 1240},
            ),
            StepDef(
                label="Draft 2 complete — 1,510 words, targets a long-tail variant",
                kind="write",
                significance="milestone",
                payload={"draft": 2, "words": 1510},
            ),
            StepDef(
                label="Flagged one claim in draft 2 for legal review",
                kind="write",
                significance="finding",
                payload={"draft": 2, "reason": "unverified performance claim"},
            ),
        ]

    def finish_summary(self, instructions: dict[str, Any]) -> str:
        return (
            "Drafted 2 SEO-optimised articles in your brand voice (1,240 and 1,510 words). "
            "One claim in draft 2 is flagged for legal review before it goes anywhere. "
            "Nothing published."
        )

    def artifacts(self, instructions: dict[str, Any]) -> list[ArtifactDef]:
        return [
            ArtifactDef(
                kind="post_draft",
                title="Draft — Why typed API clients matter more in 2026",
                format="markdown",
                content=(
                    "# Why typed API clients matter more in 2026\n\n"
                    "*(draft 1 of 2 — 1,240 words, brand voice, SEO-targeted)*\n\n"
                    "Teams shipping against a fast-moving API spend more time debugging "
                    "shape mismatches than writing features. A typed client turns that "
                    "class of bug into a compile-time error...\n"
                ),
            )
        ]
