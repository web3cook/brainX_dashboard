"""Community Scout, dummy stand-in for `reddit.*`.

Real version (not built this pass): relevant subreddits and threads, reply
opportunities.
"""

from typing import Any

from agents.base import BaseAgent, StepDef


class CommunityScoutAgent(BaseAgent):
    AGENT_NAME = "community_scout"

    def steps(self, instructions: dict[str, Any]) -> list[StepDef]:
        return [
            StepDef(
                label="Scanning r/devtools and r/SaaS for relevant threads",
                kind="read",
                significance="routine",
                payload={"target": "r/devtools, r/SaaS"},
            ),
            StepDef(
                label='Thread match: "best typed api client 2026" (r/devtools, 340 upvotes)',
                kind="read",
                significance="finding",
                payload={"subreddit": "devtools", "title": "best typed api client 2026", "upvotes": 340},
            ),
            StepDef(
                label="Checking r/devtools self-promo rules before drafting a reply",
                kind="read",
                significance="routine",
                payload={"target": "r/devtools/wiki/rules"},
            ),
            StepDef(
                label="Drafting reply 1 of 2 in your voice",
                kind="write",
                significance="routine",
                payload={"target": "r/devtools thread"},
            ),
            StepDef(
                label="Held 1 reply for manual review, house rules ban same-day self-promo",
                kind="write",
                significance="finding",
                payload={"reason": "no self-promo same day", "held": True},
            ),
        ]

    def finish_summary(self, instructions: dict[str, Any]) -> str:
        return (
            "Found a 340-upvote thread in r/devtools matching your product. Drafted one reply "
            "in your voice; held a second for manual review since that subreddit bans "
            "same-day self-promotion. Nothing posted without your approval."
        )
