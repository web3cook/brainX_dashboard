/** Agent catalog and streaming copy, ported from `brainX Dashboard.dc.html`. */

export type AgentMeta = { glyph: string; desc: string };

/** Insertion order drives the picker grid and the roster panel. */
export const AGENTS = {
  SEO: { glyph: "⌕", desc: "Keyword gaps, blog posts, landing pages" },
  GEO: { glyph: "◎", desc: "Visibility in ChatGPT & AI Overviews" },
  X: { glyph: "X", desc: "Post and thread drafts" },
  LinkedIn: { glyph: "in", desc: "Professional content and ideas" },
  Reddit: { glyph: "r/", desc: "Finds threads, drafts replies & posts" },
  Writer: { glyph: "✎", desc: "Long-form articles in your brand voice" },
  Influencer: { glyph: "@", desc: "Matches and contacts relevant creators" },
  "UGC Video": { glyph: "▶", desc: "Briefs, AI clips, ad-ready downloads" },
} as const satisfies Record<string, AgentMeta>;

export type AgentName = keyof typeof AGENTS;

export const AGENT_NAMES = Object.keys(AGENTS) as AgentName[];

/** Lines a running agent cycles through as it streams. */
export const TICKS: Partial<Record<AgentName, string[]>> = {
  SEO: [
    "scanning /docs/errors for thin content",
    "internal link opportunity: /pricing → /docs",
    "rewriting meta description 4/6",
    "schema markup added to /docs/quickstart",
  ],
  Reddit: [
    'thread match: "best typed api client 2026"',
    "checking r/devtools self-promo rules",
    "drafting reply 4/6 in your voice",
    "flagged 1 reply for manual review",
  ],
  GEO: [
    "probing question 12/24 in ChatGPT",
    "competitor cited · we are not",
    "logging answer snapshot",
    "re-running with docs update",
  ],
  X: [
    "hook variant B scored higher",
    "trimming post 5 to 268 chars",
    "attaching release-notes diff",
  ],
  Writer: ["outlining draft 3", "pulling 4 more competitor references"],
  LinkedIn: ["reading changelog", "drafting post 1/4"],
  Influencer: ["searching dev creators · 2.1K profiles"],
  "UGC Video": ["storyboarding clip 1"],
};
