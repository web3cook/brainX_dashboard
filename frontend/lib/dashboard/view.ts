/**
 * Presentation derivations for the dashboard. Pure data only — components
 * attach their own handlers, so these stay cheap to memoize and easy to read.
 */

import { AGENTS, AGENT_NAMES, type AgentName } from "./agents";
import {
  fmtK,
  fmtNum,
  usd,
  type DashboardState,
  type Panel,
  type Run,
} from "./state";

export const ACID = "#12f94b";
const AMBER = "#ffb545";
const DANGER = "#ff5f56";

export type RunCardView = {
  id: number;
  name: AgentName;
  glyph: string;
  task: string;
  statusLabel: string;
  pct: string;
  tokens: string;
  lines: string[];
  summary: string | null;
  badgeBg: string;
  badgeFg: string;
  borderColor: string;
  glyphFg: string;
  nameFg: string;
  barFg: string;
  actionLabel: string;
  actionFg: string;
  actionBg: string;
  actionBd: string;
};

export function runCardView(run: Run): RunCardView {
  const running = run.status === "running";
  const waiting = run.status === "waiting";
  const stopped = run.status === "stopped";

  return {
    id: run.id,
    name: run.name,
    glyph: AGENTS[run.name].glyph,
    task: run.task,
    statusLabel: running
      ? "RUNNING"
      : waiting
        ? "WAITING · YOU"
        : "STOPPED · CHECKPOINT",
    pct: `${run.pct}%`,
    tokens: fmtK(run.tokens),
    lines: stopped ? [] : run.lines.slice(-3),
    summary: stopped ? (run.summary ?? null) : null,
    badgeBg: running ? "#0f1f12" : waiting ? "#221c14" : "#1a1a1a",
    badgeFg: running ? ACID : waiting ? AMBER : "#8a8a8a",
    borderColor: running ? "#2f5f3f" : waiting ? "#3a3020" : "#2a2a2a",
    glyphFg: running ? ACID : waiting ? AMBER : "#8a8a8a",
    nameFg: running || waiting ? "#e6e6e6" : "#b4b4b4",
    barFg: running ? ACID : waiting ? AMBER : "#3f3f3f",
    actionLabel: running ? "■ stop" : waiting ? "review" : "▶ resume",
    actionFg: running ? DANGER : waiting ? AMBER : "#0a0a0a",
    actionBg: stopped ? ACID : "transparent",
    actionBd: running ? "#43201f" : waiting ? "#3a3020" : ACID,
  };
}

export type StatView = {
  label: string;
  value: string;
  sub: string;
  color: string;
};

export function statsView(s: DashboardState): StatView[] {
  const live = s.runs.filter((r) => r.status === "running").length;
  const stopped = s.runs.filter((r) => r.status === "stopped").length;
  const needsYou = s.runs.filter((r) => r.status !== "running").length;

  return [
    {
      label: "AGENTS LIVE",
      value: String(live),
      sub: `of ${s.runs.length} in workspace`,
      color: ACID,
    },
    {
      label: "TOKENS TODAY",
      value: fmtK(s.tokens),
      sub: `${fmtNum(s.rate)}/min right now`,
      color: "#e6e6e6",
    },
    {
      label: "SPEND TODAY",
      value: `$${s.spend.toFixed(2)}`,
      sub: "cap $25.00",
      color: "#e6e6e6",
    },
    {
      label: "NEEDS YOU",
      value: String(needsYou),
      sub: `${stopped} stopped · drafts saved`,
      color: AMBER,
    },
  ];
}

export type BurnBar = { height: string; opacity: number };

export const burnView = (s: DashboardState): BurnBar[] =>
  s.burn.map((h, i) => ({
    height: `${h}%`,
    opacity: 0.28 + (i / s.burn.length) * 0.5,
  }));

export type SpendRow = { name: string; amount: string; pct: string };

export const spendRowsView = (s: DashboardState): SpendRow[] =>
  [...s.runs]
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 5)
    .map((r) => ({
      name: r.name,
      amount: usd(r.tokens),
      pct: `${Math.min(100, Math.round(r.tokens / 500))}%`,
    }));

export type Checkpoint = {
  label: string;
  time: string;
  mark: string;
  markFg: string;
  fg: string;
  bd: string;
};

const CHECKPOINT_LABELS = [
  "Brief parsed · context loaded",
  "Phase 1 complete",
  "Phase 2 complete",
  "Phase 3 complete",
  "Final pass",
];
const CHECKPOINT_TIMES = ["14:04", "14:09", "14:14", "14:19", "14:24"];

export function checkpointsView(run: Run | undefined): Checkpoint[] {
  const done = Math.round((run ? run.pct : 0) / 20);
  return CHECKPOINT_LABELS.map((label, i) => {
    const state = i < done ? "done" : i === done ? "here" : "todo";
    return {
      label,
      time: state === "todo" ? "—" : CHECKPOINT_TIMES[i],
      mark: state === "done" ? "✓" : state === "here" ? "◉" : "○",
      markFg: state === "done" ? ACID : state === "here" ? AMBER : "#4f4f4f",
      fg: state === "todo" ? "#6f6f6f" : "#c8c8c8",
      bd: state === "here" ? "#3a3020" : state === "done" ? "#171d17" : "#171717",
    };
  });
}

export type DetailView = {
  name: AgentName;
  glyph: string;
  task: string;
  streamTitle: string;
  lines: string[];
  live: boolean;
  summary: string | null;
  checkpoints: Checkpoint[];
  tokens: string;
  cost: string;
  actionLabel: string;
  actionFg: string;
  actionBg: string;
  actionBd: string;
};

export function detailView(run: Run): DetailView {
  const running = run.status === "running";
  const waiting = run.status === "waiting";
  return {
    name: run.name,
    glyph: AGENTS[run.name].glyph,
    task: run.task,
    streamTitle: running ? "LIVE STREAM" : "RUN LOG",
    lines: run.lines,
    live: running,
    summary: run.status === "stopped" ? (run.summary ?? null) : null,
    checkpoints: checkpointsView(run),
    tokens: fmtNum(run.tokens),
    cost: usd(run.tokens),
    actionLabel: running
      ? "■ stop agent"
      : waiting
        ? "approve & continue"
        : "▶ resume from checkpoint",
    actionFg: running ? DANGER : "#0a0a0a",
    actionBg: running ? "transparent" : ACID,
    actionBd: running ? "#43201f" : ACID,
  };
}

export type SwitchView = { bg: string; justify: string; knob: string };

export const switchView = (on: boolean): SwitchView => ({
  bg: on ? ACID : "#232323",
  justify: on ? "flex-end" : "flex-start",
  knob: on ? "#0a0a0a" : "#6f6f6f",
});

export type RosterRow = {
  name: AgentName;
  glyph: string;
  state: string;
  borderColor: string;
  glyphFg: string;
  nameFg: string;
  on: boolean;
};

export function rosterView(s: DashboardState): RosterRow[] {
  return AGENT_NAMES.map((name) => {
    const run = s.runs.find((r) => r.name === name);
    const on = run?.status === "running";
    return {
      name,
      glyph: AGENTS[name].glyph,
      state: !run
        ? "on the bench"
        : run.status === "running"
          ? `running · ${run.pct}%`
          : run.status === "waiting"
            ? "waiting on you"
            : "stopped · checkpoint saved",
      borderColor: on ? "#2f5f3f" : "#171717",
      glyphFg: on ? ACID : "#8a8a8a",
      nameFg: run ? "#e6e6e6" : "#b4b4b4",
      on,
    };
  });
}

export type PickerRow = {
  name: AgentName;
  glyph: string;
  desc: string;
  borderColor: string;
  boxBd: string;
  boxBg: string;
  check: string;
  /** Already in the workspace, so it cannot be selected. */
  locked: boolean;
};

export function pickerView(s: DashboardState): PickerRow[] {
  const active = s.runs.map((r) => r.name);
  return AGENT_NAMES.map((name) => {
    const locked = active.includes(name);
    const selected = locked || !!s.pick[name];
    return {
      name,
      glyph: AGENTS[name].glyph,
      desc: locked ? "already active in this workspace" : AGENTS[name].desc,
      borderColor: selected ? "#2f5f3f" : "#1f1f1f",
      boxBd: selected ? ACID : "#333",
      boxBg: selected ? ACID : "transparent",
      check: selected ? "✓" : "",
      locked,
    };
  });
}

export function benchView(s: DashboardState) {
  const active = s.runs.map((r) => r.name);
  return AGENT_NAMES.filter((n) => !active.includes(n)).map((name) => ({
    name,
    glyph: AGENTS[name].glyph,
  }));
}

const PANEL_TITLES: Record<Exclude<Panel, "detail">, string> = {
  analytics: "ANALYTICS",
  runs: "PAST RUNS",
  agents: "AGENT ROSTER",
  settings: "SETTINGS",
  profile: "PROFILE",
};

export function panelTitle(s: DashboardState, detailRun: Run | undefined) {
  if (s.panel === "detail" && detailRun) {
    return `${detailRun.name.toUpperCase()} RUN`;
  }
  return s.panel === "detail"
    ? PANEL_TITLES.analytics
    : PANEL_TITLES[s.panel];
}

export const TAB_DEFS = [
  { key: "analytics", glyph: "◫", label: "analytics" },
  { key: "runs", glyph: "↺", label: "past runs" },
  { key: "agents", glyph: "◇", label: "agents" },
  { key: "settings", glyph: "⚙", label: "settings" },
  { key: "profile", glyph: "◔", label: "profile" },
] as const satisfies ReadonlyArray<{
  key: Exclude<Panel, "detail">;
  glyph: string;
  label: string;
}>;

export const OUTPUTS = [
  { label: "drafts written", value: "17" },
  { label: "threads seeded", value: "9" },
  { label: "pages optimized", value: "12" },
  { label: "awaiting approval", value: "3" },
];

export const HISTORY = [
  {
    glyph: "✎",
    name: "Writer",
    task: "Deep dive on typed API clients",
    dur: "18m 04s",
    cost: "$0.62",
    status: "STOPPED",
    fg: AMBER,
  },
  {
    glyph: "in",
    name: "LinkedIn",
    task: "Changelog → 4 posts",
    dur: "6m 12s",
    cost: "$0.40",
    status: "SHIPPED",
    fg: ACID,
  },
  {
    glyph: "▶",
    name: "UGC Video",
    task: "2 ad-ready clips delivered",
    dur: "22m 41s",
    cost: "$1.10",
    status: "SHIPPED",
    fg: ACID,
  },
  {
    glyph: "@",
    name: "Influencer",
    task: "12 dev creators contacted",
    dur: "14m 08s",
    cost: "$0.75",
    status: "SHIPPED",
    fg: ACID,
  },
  {
    glyph: "⌕",
    name: "SEO",
    task: "Keyword gap report · 32 gaps",
    dur: "9m 55s",
    cost: "$0.31",
    status: "SHIPPED",
    fg: ACID,
  },
  {
    glyph: "r/",
    name: "Reddit",
    task: "3 threads seeded in r/saas",
    dur: "11m 30s",
    cost: "$0.28",
    status: "SHIPPED",
    fg: ACID,
  },
];

export const PROFILE_ROWS = [
  { label: "plan", value: "Founder · $99/mo" },
  { label: "agents included", value: "all 8" },
  { label: "runs this month", value: "142" },
  { label: "spend this month", value: "$68.40" },
];
