/**
 * Frame-by-frame state for the login page's "20 seconds inside the workspace"
 * demo. Ported from the `brainX Login.dc.html` design source.
 *
 * The whole animation is a pure function of a single integer frame counter, so
 * the component that drives it only has to own a timer.
 */

export const ACID = "#12f94b";

export const CMD =
  "we are launching a new feature this week, create a marketing campaign for it";

export const PLAN =
  "Read the changelog, PRD and your last two launches. Campaign plan: launch landing page + docs SEO, a 6-post X thread, 4 LinkedIn posts, and 3 Reddit threads in the communities that shipped you traffic last time. Going live now, nothing publishes without your approval.";

/** Timer interval, in ms, between frames. */
export const TICK_MS = 95;

const T_TYPE_START = 4;
const T_TYPE_END = T_TYPE_START + CMD.length;
const T_SEND = T_TYPE_END + 2;
const T_PLAN = T_TYPE_END + 12;
const T_SPIN = T_PLAN + 8;
const T_STOP = T_SPIN + 82;
const T_RESUME = T_STOP + 30;

/** Last frame of the loop; the driver wraps back to 0 here. */
export const T_END = T_RESUME + 34;

/** Intrinsic size of the workspace mock, scaled down to fit narrow viewports. */
export const STAGE_WIDTH = 1180;
export const STAGE_HEIGHT = 660;
export const STAGE_MIN_SCALE = 0.42;
/** Horizontal breathing room left around the stage when measuring the viewport. */
export const STAGE_GUTTER = 56;

const TOKENS_PER_FRAME = 260;
const USD_PER_TOKEN = 0.000015;
const BURN_BARS = 16;

type Agent = {
  name: string;
  glyph: string;
  task: string;
  /** Frame the agent spins up on. */
  at: number;
  /** Relative throughput; scales progress and token burn. */
  speed: number;
  lines: string[];
};

const AGENTS: Agent[] = [
  {
    name: "SEO",
    glyph: "⌕",
    task: "launch page + docs cluster",
    at: T_SPIN,
    speed: 1.5,
    lines: [
      "read the PRD · feature named, positioning set",
      'keyword gap: "typed api client" (vol 2.4K)',
      "writing launch landing page + 6 docs pages",
    ],
  },
  {
    name: "X",
    glyph: "X",
    task: "launch thread · 6 posts",
    at: T_SPIN + 8,
    speed: 1.8,
    lines: [
      "cutting 6-post thread from the changelog",
      "hook variant B scored higher",
      "demo GIF attached · awaiting approval",
    ],
  },
  {
    name: "LinkedIn",
    glyph: "in",
    task: "4 launch posts",
    at: T_SPIN + 16,
    speed: 1.2,
    lines: [
      "founder voice profile loaded",
      "post 1: the problem we kept hitting",
      "post 2: what shipped this week",
    ],
  },
  {
    name: "Reddit",
    glyph: "r/",
    task: "3 threads in launch-week communities",
    at: T_SPIN + 24,
    speed: 0.9,
    lines: [
      "ranked communities by last launch traffic",
      "drafting 3 launch posts to house rules",
      "1 post held: no self-promo Tuesdays",
    ],
  },
];

/** The SEO agent is the one the operator stops mid-run. */
const STOPPED_INDEX = 0;
/** The LinkedIn agent is the one that parks itself for human review. */
const WAITING_INDEX = 2;

const BEATS = [
  { num: "01", label: "You brief the CMO in plain language", from: 0, to: T_SEND },
  {
    num: "02",
    label: "It reads your project and writes the plan",
    from: T_SEND,
    to: T_SPIN,
  },
  {
    num: "03",
    label: "Agents spin up and stream every step",
    from: T_SPIN,
    to: T_STOP,
  },
  {
    num: "04",
    label: "Stop one, it reports what it did",
    from: T_STOP,
    to: T_RESUME,
  },
  {
    num: "05",
    label: "Resume from the last checkpoint",
    from: T_RESUME,
    to: T_END + 1,
  },
];

export type AgentStatus = "" | "RUNNING" | "STOPPED" | "WAITING · YOU";

export type AgentCardState = {
  name: string;
  glyph: string;
  task: string;
  status: AgentStatus;
  /** 0 before the agent spins up, 1 after, drives the enter transition. */
  opacity: number;
  transform: string;
  borderColor: string;
  glyphColor: string;
  nameColor: string;
  badgeBg: string;
  badgeFg: string;
  barColor: string;
  /** CSS width, e.g. `"42%"`. */
  pct: string;
  tokens: string;
  lines: string[];
  summary: string | null;
  action: string;
  actionFg: string;
  actionBg: string;
  actionBd: string;
};

export type Message = { who: string; text: string };
export type Stat = { label: string; value: string; color: string };
export type BurnBar = { height: string; opacity: number };
export type SpendRow = { name: string; amount: string; pct: string };
export type Beat = {
  num: string;
  label: string;
  bg: string;
  fg: string;
  numFg: string;
};

export type Frame = {
  typed: string;
  messages: Message[];
  thinking: boolean;
  cards: AgentCardState[];
  stats: Stat[];
  burn: BurnBar[];
  spendRows: SpendRow[];
  beats: Beat[];
  rate: string;
  spend: string;
  beatHint: string;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * Tokens an agent has burned by frame `f`. The stopped agent's meter freezes at
 * the moment it was stopped and only resumes once the operator resumes it.
 */
function elapsedFrames(agent: Agent, index: number, f: number): number {
  if (index === STOPPED_INDEX && f >= T_STOP && f < T_RESUME) {
    return T_STOP - agent.at;
  }
  return Math.max(0, f - agent.at);
}

function agentTokens(agent: Agent, index: number, f: number): number {
  return elapsedFrames(agent, index, f) * TOKENS_PER_FRAME * agent.speed;
}

const usd = (tokens: number) => `$${(tokens * USD_PER_TOKEN).toFixed(2)}`;

export function computeFrame(f: number): Frame {
  const typedLen = clamp(f - T_TYPE_START, 0, CMD.length);
  const typed = f < T_PLAN ? CMD.slice(0, typedLen) : "";

  const messages: Message[] = [];
  if (f >= T_SEND) messages.push({ who: "YOU · now", text: CMD });
  if (f >= T_PLAN) messages.push({ who: "CMO · now", text: PLAN });
  if (f >= T_STOP + 4) {
    messages.push({
      who: "CMO · now",
      text: "SEO agent stopped on your command. Launch page draft saved at checkpoint 3 of 5, nothing published.",
    });
  }
  if (f >= T_RESUME + 4) {
    messages.push({
      who: "CMO · now",
      text: "Resumed from checkpoint 3. Campaign is back on track for Thursday's launch.",
    });
  }

  const thinking = f >= T_SEND && f < T_PLAN;

  const cards: AgentCardState[] = AGENTS.map((agent, i) => {
    const born = f >= agent.at;
    const age = Math.max(0, f - agent.at);
    const stopped = i === STOPPED_INDEX && f >= T_STOP && f < T_RESUME;
    const waiting = i === WAITING_INDEX && f > agent.at + 46;

    let pct = Math.min(96, age * agent.speed);
    if (stopped) {
      pct = Math.min(96, (T_STOP - agent.at) * agent.speed);
    } else if (i === STOPPED_INDEX && f >= T_RESUME) {
      // Picks up from the checkpoint rather than from where a never-stopped
      // agent would be.
      pct = Math.min(
        98,
        (T_STOP - agent.at) * agent.speed + (f - T_RESUME) * agent.speed,
      );
    }

    const shownLines = Math.min(agent.lines.length, Math.floor(age / 11) + 1);
    const tokens = Math.round(age * TOKENS_PER_FRAME * agent.speed);

    const status: AgentStatus = !born
      ? ""
      : stopped
        ? "STOPPED"
        : waiting
          ? "WAITING · YOU"
          : "RUNNING";

    return {
      name: agent.name,
      glyph: agent.glyph,
      task: agent.task,
      status,
      opacity: born ? 1 : 0,
      transform: born ? "translateY(0)" : "translateY(10px)",
      borderColor: !born
        ? "#141414"
        : stopped
          ? "#2a2a2a"
          : waiting
            ? "#3a3020"
            : "#2f5f3f",
      glyphColor: !born
        ? "#3f3f3f"
        : stopped
          ? "#8a8a8a"
          : waiting
            ? "#ffb545"
            : ACID,
      nameColor: born ? "#e6e6e6" : "#4f4f4f",
      badgeBg: stopped ? "#1a1a1a" : waiting ? "#221c14" : "#0f1f12",
      badgeFg: stopped ? "#8a8a8a" : waiting ? "#ffb545" : ACID,
      barColor: stopped ? "#3f3f3f" : waiting ? "#ffb545" : ACID,
      pct: `${(born ? pct : 0).toFixed(0)}%`,
      tokens: born ? `${(tokens / 1000).toFixed(1)}K` : "0",
      lines: stopped ? [] : born ? agent.lines.slice(0, shownLines) : [],
      summary: stopped
        ? "Launch page drafted and 4 of 6 docs pages rewritten around the new feature. Saved as drafts, nothing pushed live."
        : null,
      action: !born ? "" : stopped ? "▶ resume" : waiting ? "review" : "■ stop",
      actionFg: stopped ? "#0a0a0a" : waiting ? "#ffb545" : "#ff5f56",
      actionBg: stopped ? ACID : "transparent",
      actionBd: stopped ? ACID : waiting ? "#3a3020" : "#43201f",
    };
  });

  const liveCount = cards.filter((c) => c.status === "RUNNING").length;

  const totalTokens = AGENTS.reduce(
    (sum, agent, i) => sum + agentTokens(agent, i, f),
    0,
  );

  // Pinned locale: this renders during SSR too, and an implicit locale would
  // risk a hydration mismatch.
  const rate = liveCount
    ? (260 + liveCount * 290 + ((f * 37) % 140)).toLocaleString("en-US")
    : "0";

  const burn: BurnBar[] = Array.from({ length: BURN_BARS }, (_, i) => {
    const t = f - (BURN_BARS - 1 - i) * 2;
    const live = AGENTS.filter(
      (agent, index) =>
        t >= agent.at &&
        !(index === STOPPED_INDEX && t >= T_STOP && t < T_RESUME),
    ).length;
    return {
      height: `${live ? 18 + live * 19 + ((t * 23) % 22) : 4}%`,
      opacity: 0.3 + (i / BURN_BARS) * 0.5,
    };
  });

  const spendData = AGENTS.map((agent, i) => ({ agent, i }))
    .filter(({ agent }) => f >= agent.at)
    .map(({ agent, i }) => ({
      name: agent.name,
      tokens: agentTokens(agent, i, f),
    }));
  const maxTokens = Math.max(1, ...spendData.map((d) => d.tokens));
  const spendRows: SpendRow[] = spendData.map((d) => ({
    name: d.name,
    amount: usd(d.tokens),
    pct: `${Math.round(8 + (d.tokens / maxTokens) * 92)}%`,
  }));

  const activeBeat = BEATS.findIndex((b) => f >= b.from && f < b.to);

  return {
    typed,
    messages,
    thinking,
    cards,
    burn,
    spendRows,
    rate,
    spend: usd(totalTokens),
    beatHint: liveCount ? `${liveCount} streaming` : "standing by",
    stats: [
      { label: "AGENTS LIVE", value: String(liveCount), color: ACID },
      {
        label: "TOKENS",
        value: `${(totalTokens / 1000).toFixed(1)}K`,
        color: "#e6e6e6",
      },
      { label: "SPEND", value: usd(totalTokens), color: "#e6e6e6" },
    ],
    beats: BEATS.map((b, i) => ({
      num: b.num,
      label: b.label,
      bg: i === activeBeat ? "#0f1f12" : "#0a0d0a",
      fg: i === activeBeat ? "#e6e6e6" : "#6f6f6f",
      numFg: i === activeBeat ? ACID : "#4f5f4f",
    })),
  };
}
