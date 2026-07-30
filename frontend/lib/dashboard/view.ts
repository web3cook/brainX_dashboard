/** Presentation derivations for the dashboard, pure data only, components
 * attach their own handlers. Rewritten for the real backend: the earlier
 * mock's token-burn chart and spend-by-agent rows had no backing data once
 * wired to the real API (the dummy agents don't simulate a cost model), so
 * this replaces them with what genuinely exists, phase status and step
 * counts, rather than fabricating numbers to keep the old visuals.
 */

import type { AgentName, RunSummary } from "@/lib/api/types";
import { AGENTS, agentGlyph } from "./agents";
import type { DashboardState, Run } from "./state";

export const ACID = "#12f94b";
const AMBER = "#ffb545";
const DANGER = "#ff5f56";

/** 1234 → "1.2K", 1234567 → "1.23M". Tokens only ever need coarse magnitude
 * at a glance; the exact figure lives in the analytics breakdown. */
export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Sub-cent spend is common here (a cached planning call is ~$0.01), so
 * round to 4dp below a cent rather than showing a misleading "$0.00". */
export function usd(n: number): string {
  if (n > 0 && n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export type RunCardView = {
  id: string;
  name: AgentName;
  glyph: string;
  task: string;
  statusLabel: string;
  pct: string;
  steps: string;
  lines: string[];
  summary: string | null;
  badgeBg: string;
  badgeFg: string;
  borderColor: string;
  glyphFg: string;
  nameFg: string;
  barFg: string;
};

export function runCardView(run: Run): RunCardView {
  const running = run.status === "running";
  const stopped = run.status === "stopped";
  const failed = run.status === "failed";
  const done = run.status === "completed";

  return {
    id: run.id,
    name: run.name,
    glyph: agentGlyph(run.name),
    task: run.task,
    statusLabel: done
      ? "SHIPPED"
      : failed
        ? "FAILED"
        : stopped
          ? "STOPPED · CHECKPOINT"
          : "RUNNING",
    pct: `${run.pct}%`,
    steps: `${run.steps} step${run.steps === 1 ? "" : "s"}`,
    lines: stopped || done ? [] : run.lines,
    summary: stopped || done ? run.summary : null,
    badgeBg: running ? "#0f1f12" : failed ? "#2a1414" : "#1a1a1a",
    badgeFg: running ? ACID : failed ? DANGER : done ? ACID : "#8a8a8a",
    borderColor: running ? "#2f5f3f" : failed ? "#5f2f2f" : "#2a2a2a",
    glyphFg: running ? ACID : failed ? DANGER : "#8a8a8a",
    nameFg: running ? "#e6e6e6" : "#b4b4b4",
    // A shipped run keeps a full green bar; grey is reserved for a card that
    // has genuinely done nothing yet.
    barFg: running || done ? ACID : failed ? DANGER : stopped ? AMBER : "#3f3f3f",
  };
}

export type StatView = { label: string; value: string; sub: string; color: string };

export function statsView(state: DashboardState): StatView[] {
  const runs = Object.values(state.runs);
  const live = runs.filter((r) => r.status === "running").length;
  const needsYou = runs.filter((r) => r.status === "stopped" || r.status === "failed").length;
  const stepsLogged = runs.reduce((sum, r) => sum + r.steps, 0);
  const phases = state.plan?.phases ?? [];
  const donePhases = phases.filter((p) => p.status === "completed").length;

  const totalTokens = state.usage.measured.totalTokens + state.usage.simulated.totalTokens;
  const totalCost = state.usage.measured.costUsd + state.usage.simulated.costUsd;

  return [
    { label: "AGENTS LIVE", value: String(live), sub: `of ${runs.length} in this run`, color: ACID },
    {
      label: "PHASES DONE",
      value: `${donePhases}/${phases.length}`,
      sub: `${stepsLogged} steps logged`,
      color: "#e6e6e6",
    },
    {
      label: "TOKENS",
      value: fmtTokens(totalTokens),
      sub: state.usage.simulated.totalTokens > 0 ? "incl. simulated" : "measured",
      color: "#e6e6e6",
    },
    { label: "SPEND", value: usd(totalCost), sub: `${needsYou} need${needsYou === 1 ? "s" : ""} you`, color: AMBER },
  ];
}

export type Checkpoint = {
  label: string;
  time: string;
  mark: string;
  markFg: string;
  fg: string;
  bd: string;
};

export function checkpointsView(run: Run | undefined): Checkpoint[] {
  const labels = run?.lines ?? [];
  if (labels.length === 0) {
    return [{ label: "Waiting for the first step…", time: "", mark: "○", markFg: "#4f4f4f", fg: "#6f6f6f", bd: "#171717" }];
  }
  return labels.map((label, i) => ({
    label,
    time: "",
    mark: i === labels.length - 1 && run?.status === "running" ? "◉" : "✓",
    markFg: i === labels.length - 1 && run?.status === "running" ? AMBER : ACID,
    fg: "#c8c8c8",
    bd: "#171d17",
  }));
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
  steps: string;
};

export function detailView(run: Run): DetailView {
  const running = run.status === "running";
  return {
    name: run.name,
    glyph: agentGlyph(run.name),
    task: run.task,
    streamTitle: running ? "LIVE STREAM" : "RUN LOG",
    lines: run.lines,
    live: running,
    summary: run.status === "stopped" || run.status === "completed" ? run.summary : null,
    checkpoints: checkpointsView(run),
    steps: `${run.steps} step${run.steps === 1 ? "" : "s"}`,
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
  label: string;
  state: string;
  borderColor: string;
  glyphFg: string;
  nameFg: string;
};

export function rosterView(state: DashboardState): RosterRow[] {
  const byAgent = new Map<AgentName, Run>();
  for (const run of Object.values(state.runs)) byAgent.set(run.name, run);

  return (Object.keys(AGENTS) as AgentName[]).map((name) => {
    const run = byAgent.get(name);
    const on = run?.status === "running";
    return {
      name,
      glyph: AGENTS[name].glyph,
      label: AGENTS[name].label,
      state: !run
        ? "not in this plan"
        : run.status === "running"
          ? `running · ${run.pct}%`
          : run.status === "completed"
            ? "shipped"
            : run.status === "failed"
              ? "failed"
              : "stopped · checkpoint saved",
      borderColor: on ? "#2f5f3f" : "#171717",
      glyphFg: on ? ACID : "#8a8a8a",
      nameFg: run ? "#e6e6e6" : "#5f5f5f",
    };
  });
}

const PANEL_TITLES: Record<Exclude<DashboardState["panel"], "detail">, string> = {
  analytics: "PLAN & PROGRESS",
  runs: "PAST RUNS",
  agents: "AGENT ROSTER",
  settings: "SETTINGS",
  profile: "PROFILE",
};

export function panelTitle(state: DashboardState, detailRun: Run | undefined) {
  if (state.panel === "detail" && detailRun) return `${detailRun.name.replace(/_/g, " ").toUpperCase()} RUN`;
  return state.panel === "detail" ? PANEL_TITLES.analytics : PANEL_TITLES[state.panel];
}

export const TAB_DEFS = [
  { key: "analytics", glyph: "◫", label: "plan & progress" },
  { key: "runs", glyph: "↺", label: "past runs" },
  { key: "agents", glyph: "◇", label: "agents" },
  { key: "settings", glyph: "⚙", label: "settings" },
  { key: "profile", glyph: "◔", label: "profile" },
] as const satisfies ReadonlyArray<{
  key: Exclude<DashboardState["panel"], "detail">;
  glyph: string;
  label: string;
}>;

export const PROFILE_ROWS = [
  { label: "plan", value: "Founder · $99/mo" },
  { label: "agents included", value: "all 5" },
];

export type HistoryRow = {
  id: string;
  title: string;
  state: string;
  fg: string;
  createdAt: string;
};

export function historyView(runs: RunSummary[]): HistoryRow[] {
  return runs.map((r) => ({
    id: r.id,
    title: r.title,
    state: r.state.toUpperCase(),
    fg: r.state === "completed" ? ACID : r.state === "failed" ? DANGER : "#8a8a8a",
    createdAt: new Date(r.created_at).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));
}
