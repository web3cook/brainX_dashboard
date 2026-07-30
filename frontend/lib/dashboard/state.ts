import { AGENTS, TICKS, type AgentName } from "./agents";

export type RunStatus = "running" | "waiting" | "stopped";

export type Run = {
  id: number;
  name: AgentName;
  task: string;
  status: RunStatus;
  pct: number;
  tokens: number;
  lines: string[];
  summary?: string | null;
};

export type ChatAction = {
  label: string;
  body: string;
  confirm: string;
  agent: AgentName;
};

export type ChatMessage = {
  who: string;
  text: string;
  action?: ChatAction | null;
};

export type Panel =
  | "analytics"
  | "runs"
  | "agents"
  | "settings"
  | "profile"
  | "detail";

export type Guardrail = { label: string; on: boolean };

export type DashboardState = {
  panel: Panel;
  selected: number | null;
  pickerOpen: boolean;
  input: string;
  thinking: boolean;
  tokens: number;
  spend: number;
  rate: number;
  tick: number;
  burn: number[];
  /** Agents checked in the picker but not yet deployed. */
  pick: Record<string, boolean>;
  guardrails: Guardrail[];
  chat: ChatMessage[];
  runs: Run[];
};

export const TICK_MS = 1400;

/** Both dimensions are fixed; the whole stage scales to fit the viewport. */
export const STAGE_WIDTH = 1440;
export const STAGE_HEIGHT = 900;

const USD_PER_TOKEN = 0.000015;
const SPEND_PER_TOKEN = 0.0000075;

export const initialState: DashboardState = {
  panel: "analytics",
  selected: null,
  pickerOpen: false,
  input: "",
  thinking: false,
  tokens: 284120,
  spend: 4.21,
  rate: 1284,
  tick: 0,
  burn: [
    38, 54, 41, 72, 61, 88, 64, 96, 70, 52, 81, 66, 92, 74, 58, 86, 69, 77, 64,
    93,
  ],
  pick: {},
  guardrails: [
    { label: "Ask before anything publishes", on: true },
    { label: "Auto-pause on off-voice drafts", on: true },
    { label: "Allow outbound DMs", on: false },
    { label: "Weekly digest email", on: true },
  ],
  chat: [
    {
      who: "YOU · 14:02",
      text: "We shipped the new API docs. Get us noticed by devs this week.",
    },
    {
      who: "CMO · 14:02",
      text: "Read your changelog and repo. I'd run SEO on the six docs pages, seed 3 Reddit threads, and queue an X thread from the release notes.",
    },
    { who: "YOU · 14:05", text: "Do it, but keep spend under $10 today." },
    {
      who: "CMO · 14:05",
      text: "Cap set. 4 agents deployed — I'll ping you before anything publishes.",
    },
    {
      who: "CMO · 14:23",
      text: "Writer stopped at your request. Checkpoint 3 of 5 saved.",
      action: {
        label: "ACTION PROPOSED",
        body: "Resume the Writer from checkpoint 3 and hold draft 3 for your review before publishing.",
        confirm: "resume writer",
        agent: "Writer",
      },
    },
  ],
  runs: [
    {
      id: 1,
      name: "SEO",
      task: "docs cluster · 6 pages",
      status: "running",
      pct: 64,
      tokens: 18200,
      lines: [
        "crawled 6 docs pages · 3 thin-content flags",
        'keyword gap: "typed api client" (vol 2.4K)',
        "rewriting /docs/quickstart title + h1",
      ],
    },
    {
      id: 2,
      name: "Reddit",
      task: "r/devtools thread seeding",
      status: "running",
      pct: 41,
      tokens: 9700,
      lines: [
        "412 threads scanned · 6 matched",
        "drafting reply 3/6 in your voice",
        "1 reply held: rules ban self-promo",
      ],
    },
    {
      id: 3,
      name: "X",
      task: "release-notes thread",
      status: "waiting",
      pct: 88,
      tokens: 6100,
      lines: [
        "8-post thread drafted",
        "hook A/B ready for your pick",
        "awaiting approval to post",
      ],
    },
    {
      id: 4,
      name: "GEO",
      task: "ChatGPT visibility audit",
      status: "running",
      pct: 22,
      tokens: 4400,
      lines: [
        "probing 24 buyer questions",
        "cited in 3/24 answers today",
        "competitor cited in 11/24",
      ],
    },
    {
      id: 5,
      name: "Writer",
      task: "deep dive · typed API clients",
      status: "stopped",
      pct: 60,
      tokens: 41208,
      summary:
        "Drafted 2 of 3 long-form posts in brand voice, pulled 14 competitor references, flagged 1 claim for legal review. Nothing published.",
      lines: [
        "voice profile loaded from 41 posts",
        "draft 1 complete · 1,240 words",
        "draft 2 complete · 1,510 words",
        "stopped by you at 14:22",
      ],
    },
  ],
};

export type Action =
  | { type: "tick" }
  | { type: "setPanel"; panel: Panel }
  | { type: "selectRun"; id: number }
  | { type: "closeDetail" }
  | { type: "setInput"; value: string }
  | { type: "clearInput" }
  | { type: "say"; who: string; text: string; action?: ChatAction | null }
  | { type: "thinking"; value: boolean }
  | { type: "dismissAction"; index: number }
  | { type: "stop"; id: number }
  | { type: "resume"; id: number }
  | { type: "approve"; id: number }
  | { type: "stopAll" }
  | { type: "addAgent"; name: AgentName }
  | { type: "openPicker" }
  | { type: "closePicker" }
  | { type: "togglePick"; name: string }
  | { type: "resetPick" }
  | { type: "toggleGuardrail"; index: number };

/** Advances one running agent's stream by a single beat. */
function advanceRun(run: Run, tick: number): Run {
  if (run.status !== "running") return run;

  const pool = TICKS[run.name] ?? [];
  const emits = tick % 3 === 0 && pool.length > 0;
  const lines = emits
    ? [...run.lines, pool[Math.floor(tick / 3) % pool.length]].slice(-6)
    : run.lines;

  return {
    ...run,
    lines,
    pct: Math.min(99, run.pct + 1),
    tokens: run.tokens + 220 + ((tick * 37) % 180),
  };
}

export function reducer(
  state: DashboardState,
  action: Action,
): DashboardState {
  switch (action.type) {
    case "tick": {
      const liveCount = state.runs.filter((r) => r.status === "running").length;
      const inc = liveCount * 260;
      return {
        ...state,
        runs: state.runs.map((r) => advanceRun(r, state.tick)),
        tick: state.tick + 1,
        tokens: state.tokens + inc,
        spend: Number((state.spend + inc * SPEND_PER_TOKEN).toFixed(4)),
        rate: liveCount
          ? 240 + liveCount * 260 + ((state.tick * 53) % 180)
          : 0,
        burn: [
          ...state.burn.slice(1),
          liveCount ? 40 + ((state.tick * 29) % 60) : 6,
        ],
      };
    }

    case "setPanel":
      return { ...state, panel: action.panel, selected: null };

    case "selectRun":
      return { ...state, selected: action.id, panel: "detail" };

    case "closeDetail":
      return { ...state, panel: "analytics", selected: null };

    case "setInput":
      return { ...state, input: action.value };

    case "clearInput":
      return { ...state, input: "" };

    case "say":
      return {
        ...state,
        chat: [
          ...state.chat,
          { who: action.who, text: action.text, action: action.action ?? null },
        ],
      };

    case "thinking":
      return { ...state, thinking: action.value };

    case "dismissAction":
      return {
        ...state,
        chat: state.chat.map((m, i) =>
          i === action.index ? { ...m, action: null } : m,
        ),
      };

    case "stop":
      return {
        ...state,
        runs: state.runs.map((r) =>
          r.id !== action.id
            ? r
            : {
                ...r,
                status: "stopped",
                summary: `Stopped mid-run at ${r.pct}%. ${r.lines.length} steps completed, outputs saved as drafts. Nothing published.`,
                lines: [...r.lines, "stopped by you · checkpoint saved"],
              },
        ),
      };

    case "resume":
      return {
        ...state,
        runs: state.runs.map((r) =>
          r.id !== action.id
            ? r
            : {
                ...r,
                status: "running",
                summary: null,
                lines: [...r.lines, "resumed from last checkpoint"].slice(-6),
              },
        ),
      };

    case "approve":
      return {
        ...state,
        runs: state.runs.map((r) =>
          r.id !== action.id ? r : { ...r, status: "running", pct: 92 },
        ),
      };

    case "stopAll":
      return {
        ...state,
        runs: state.runs.map((r) =>
          r.status !== "running"
            ? r
            : {
                ...r,
                status: "stopped",
                summary: `Stopped at ${r.pct}%. Checkpoint saved, outputs kept as drafts.`,
              },
        ),
      };

    case "addAgent": {
      if (state.runs.some((r) => r.name === action.name)) return state;
      const id = Math.max(0, ...state.runs.map((r) => r.id)) + 1;
      return {
        ...state,
        runs: [
          ...state.runs,
          {
            id,
            name: action.name,
            task: "brief pending · warming up",
            status: "running",
            pct: 4,
            tokens: 320,
            lines: ["reading brand voice profile", "loading project context"],
          },
        ],
      };
    }

    case "openPicker":
      return { ...state, pickerOpen: true };

    case "closePicker":
      return { ...state, pickerOpen: false };

    case "togglePick":
      return {
        ...state,
        pick: { ...state.pick, [action.name]: !state.pick[action.name] },
      };

    case "resetPick":
      return { ...state, pick: {} };

    case "toggleGuardrail":
      return {
        ...state,
        guardrails: state.guardrails.map((g, i) =>
          i === action.index ? { ...g, on: !g.on } : g,
        ),
      };
  }
}

export const fmtK = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

export const usd = (tokens: number) =>
  `$${(tokens * USD_PER_TOKEN).toFixed(2)}`;

/** Pinned locale so server and client render identical markup. */
export const fmtNum = (n: number) => n.toLocaleString("en-US");

export const agentGlyph = (name: AgentName) => AGENTS[name].glyph;
