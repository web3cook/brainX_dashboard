import type { AgentName } from "@/lib/api/types";

export type { AgentName };

/** Catalog of the real 7 subagents the backend can spawn, must match
 * `scopes.agent_name`'s CHECK constraint (docs/DB_SCHEMA.md) exactly.
 */
export const AGENTS: Record<AgentName, { glyph: string; label: string; desc: string }> = {
  market_scout: {
    glyph: "⌕",
    label: "Market Scout",
    desc: "Competitor and market research, positioning gaps",
  },
  seo_geo_analyst: {
    glyph: "◎",
    label: "SEO/GEO Analyst",
    desc: "Keyword gaps, SERP position, LLM-citation coverage",
  },
  community_scout: {
    glyph: "r/",
    label: "Community Scout",
    desc: "Relevant subreddits and threads, reply opportunities",
  },
  x_scout: {
    glyph: "X",
    label: "X Scout",
    desc: "People worth connecting with on X, posts and replies",
  },
  linkedin_scout: {
    glyph: "in",
    label: "Linkedin Scout",
    desc: "People worth connecting with on LinkedIn, posts and replies",
  },
  content_writer: {
    glyph: "✎",
    label: "Content Writer",
    desc: "SEO-optimised articles in the brand voice",
  },
  influencer: {
    glyph: "★",
    label: "Influencer",
    desc: "Influencers relevant to the product, partnership outreach",
  },
};

export const AGENT_NAMES = Object.keys(AGENTS) as AgentName[];

export const agentGlyph = (name: AgentName) => AGENTS[name].glyph;
export const agentLabel = (name: AgentName) => AGENTS[name].label;
