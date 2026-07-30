"""SEO/GEO Analyst — dummy stand-in for `seo.*` / `geo.*`.

Real version (not built this pass): keyword gaps, SERP position, LLM-citation
coverage in ChatGPT/AI Overviews.
"""

from typing import Any

from agents.base import ArtifactDef, BaseAgent, StepDef


class SeoGeoAnalystAgent(BaseAgent):
    AGENT_NAME = "seo_geo_analyst"

    def steps(self, instructions: dict[str, Any]) -> list[StepDef]:
        return [
            StepDef(
                label="Crawling 6 docs pages for thin content",
                kind="read",
                significance="routine",
                payload={"target": "/docs/*"},
            ),
            StepDef(
                label='Keyword gap: "typed api client" (vol 2.4K, position: unranked)',
                kind="read",
                significance="finding",
                payload={"keyword": "typed api client", "volume": 2400, "position": None},
            ),
            StepDef(
                label="Probing 12 buyer questions in ChatGPT for citation coverage",
                kind="read",
                significance="routine",
                payload={"target": "chatgpt.citation_probe"},
            ),
            StepDef(
                label="Cited in 3 of 12 answers today; competitor cited in 9 of 12",
                kind="read",
                significance="finding",
                payload={"our_citations": 3, "competitor_citations": 9, "sample_size": 12},
            ),
            StepDef(
                label="Rewriting /docs/quickstart title and h1 for the keyword gap",
                kind="write",
                significance="milestone",
                payload={"target": "/docs/quickstart"},
            ),
        ]

    def finish_summary(self, instructions: dict[str, Any]) -> str:
        return (
            'Found a keyword gap on "typed api client" (2.4K/mo, currently unranked) and low '
            "AI-citation coverage (3/12 vs a competitor's 9/12). Rewrote the quickstart page "
            "title/h1 to target the gap; full keyword table attached."
        )

    def artifacts(self, instructions: dict[str, Any]) -> list[ArtifactDef]:
        return [
            ArtifactDef(
                kind="keyword_table",
                title="Docs SEO gap analysis",
                format="csv",
                content=(
                    "keyword,volume,our_position,notes\n"
                    "typed api client,2400,unranked,quickstart page rewritten to target this\n"
                    "type-safe sdk,1100,unranked,docs page missing\n"
                    "openapi client generator,890,14,could move up with internal links\n"
                ),
            )
        ]
