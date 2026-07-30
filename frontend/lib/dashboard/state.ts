/** Event-driven dashboard state. Replaces the earlier `setInterval` mock,
 * every mutation now either comes from a real REST response (`initRun`) or
 * folds one real `run_events` envelope from the WebSocket (`applyEvent`).
 * There is no more synthetic tick loop.
 */

import type {
  AgentName,
  AutonomyMode,
  Phase,
  PhaseStatus,
  Plan,
  RunEventEnvelope,
  RunState as BackendRunState,
  RunSummary,
  UsagePayload,
} from "@/lib/api/types";

const TERMINAL_RUN_STATES: BackendRunState[] = ["stopped", "failed", "completed"];
export const isTerminalRunState = (s: BackendRunState | null) =>
  s !== null && TERMINAL_RUN_STATES.includes(s);

export type RunStatus = "running" | "waiting" | "stopped" | "completed" | "failed";

/** One agent invocation, the frontend's closest concept to a backend Scope,
 * not a Phase (there is no rendered Phase→Task→Step tree in this pass; see
 * docs/ARCHITECTURE.md §9's noted scope for the deferred full timeline). */
export type Run = {
  id: string;
  name: AgentName;
  task: string;
  status: RunStatus;
  /** Heuristic, the backend has no numeric progress field, only a stream of
   * step events, so this climbs with each completed step rather than being
   * read from the server. */
  pct: number;
  steps: number;
  lines: string[];
  summary: string | null;
};

export type ChatAction = {
  label: string;
  kind: "approve_plan";
};

export type ChatMessage = {
  who: string;
  text: string;
  action?: ChatAction | null;
};

export type Panel = "analytics" | "runs" | "agents" | "settings" | "profile" | "detail";

/** Cosmetic only, there is no backend concept of guardrails in this pass. */
export type Guardrail = { label: string; on: boolean };

/** Running token/cost totals, accumulated from `usage.recorded` events.
 * `measured` is the CMO's real API-reported spend; `simulated` is the dummy
 * subagents' synthetic figures. Kept separate all the way to the UI so the
 * distinction is never lost; see MEMO.md. */
export type UsageBucket = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  costUsd: number;
};

export type UsageTotals = {
  measured: UsageBucket;
  simulated: UsageBucket;
  byAgent: Record<string, { totalTokens: number; costUsd: number }>;
};

const emptyBucket = (): UsageBucket => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 0,
  costUsd: 0,
});

export const emptyUsage = (): UsageTotals => ({
  measured: emptyBucket(),
  simulated: emptyBucket(),
  byAgent: {},
});

function addUsage(totals: UsageTotals, u: UsagePayload): UsageTotals {
  const key = u.simulated ? "simulated" : "measured";
  const b = totals[key];
  const next: UsageTotals = {
    ...totals,
    [key]: {
      inputTokens: b.inputTokens + u.input_tokens,
      outputTokens: b.outputTokens + u.output_tokens,
      cacheReadTokens: b.cacheReadTokens + u.cache_read_tokens,
      cacheWriteTokens: b.cacheWriteTokens + u.cache_write_tokens,
      totalTokens: b.totalTokens + u.total_tokens,
      costUsd: b.costUsd + u.cost_usd,
    },
  };
  const who = u.agent_name ?? "AI CMO";
  const prev = totals.byAgent[who] ?? { totalTokens: 0, costUsd: 0 };
  next.byAgent = {
    ...totals.byAgent,
    [who]: {
      totalTokens: prev.totalTokens + u.total_tokens,
      costUsd: prev.costUsd + u.cost_usd,
    },
  };
  return next;
}

export type DashboardState = {
  runId: string | null;
  runState: BackendRunState | null;
  autonomyMode: AutonomyMode;
  plan: Plan | null;
  /** Which phase ids the operator wants to actually run, shown as checkboxes
   * on the plan-approval card. `null` when there's no plan awaiting a
   * selection (no plan yet, or one already approved). Defaults to "every
   * phase" the moment a plan arrives, approving without touching anything
   * behaves exactly like the old all-or-nothing approve. */
  planSelection: Set<string> | null;
  panel: Panel;
  selected: string | null;
  input: string;
  chat: ChatMessage[];
  runs: Record<string, Run>;
  guardrails: Guardrail[];
  pastRuns: RunSummary[];
  usage: UsageTotals;
  lastSeq: number;
};

export const initialState: DashboardState = {
  runId: null,
  runState: null,
  autonomyMode: "plan_then_run",
  plan: null,
  planSelection: null,
  panel: "analytics",
  selected: null,
  input: "",
  chat: [],
  runs: {},
  guardrails: [
    { label: "Ask before anything publishes", on: true },
    { label: "Auto-pause on off-voice drafts", on: true },
    { label: "Allow outbound DMs", on: false },
    { label: "Weekly digest email", on: true },
  ],
  pastRuns: [],
  usage: emptyUsage(),
  lastSeq: 0,
};

export type Action =
  | { type: "setPanel"; panel: Panel }
  | { type: "selectRun"; id: string }
  | { type: "closeDetail" }
  | { type: "setInput"; value: string }
  | { type: "clearInput" }
  | { type: "toggleGuardrail"; index: number }
  | { type: "dismissAction"; index: number }
  | { type: "setAutonomyMode"; mode: AutonomyMode }
  | { type: "togglePhase"; phaseId: string }
  | { type: "initRun"; runId: string; runState: BackendRunState; plan: Plan | null }
  | { type: "resetRun" }
  | { type: "setPastRuns"; runs: RunSummary[] }
  | { type: "addPastRun"; run: RunSummary }
  | { type: "say"; who: string; text: string }
  | { type: "applyEvent"; event: RunEventEnvelope };

function upsertRun(
  runs: Record<string, Run>,
  scopeId: string,
  patch: Partial<Run>,
): Record<string, Run> {
  const existing: Run = runs[scopeId] ?? {
    id: scopeId,
    name: "market_scout",
    task: "",
    status: "running",
    pct: 5,
    steps: 0,
    lines: [],
    summary: null,
  };
  return { ...runs, [scopeId]: { ...existing, ...patch } };
}

/** The plan arrives once via `plan.proposed` with every phase `pending`.
 * The backend tracks real phase status in `runs.plan`, but only broadcasts
 * the transitions as `phase.*` events, so the client has to fold them back
 * in. Without this the plan list and the PHASES DONE counter stay frozen at
 * their proposed state for the whole run. */
function setPhaseStatus(
  plan: Plan | null,
  phaseId: string | null,
  status: PhaseStatus,
): Plan | null {
  if (!plan || !phaseId) return plan;
  let changed = false;
  const phases = plan.phases.map((p) => {
    if (p.id !== phaseId || p.status === status) return p;
    changed = true;
    return { ...p, status };
  });
  return changed ? { ...plan, phases } : plan;
}

function phaseTitle(plan: Plan | null, phaseId: string | null): string {
  if (!plan || !phaseId) return "";
  return plan.phases.find((p) => p.id === phaseId)?.title ?? "";
}

function planApprovalCard(): ChatAction {
  return { label: "PROPOSED PLAN, choose which phases to run", kind: "approve_plan" };
}

/** Selecting a phase pulls in everything it depends on (you can't run a
 * phase without its prerequisites); deselecting a phase drops everything
 * that depends on it (transitively, in case of a chain). Both run as
 * fixed-point loops over the (tiny, ≤7-phase) plan rather than a real graph
 * walk, simplest correct thing at this scale. */
function selectPhase(phases: Phase[], selected: Set<string>, phaseId: string): Set<string> {
  const next = new Set(selected);
  next.add(phaseId);
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of phases) {
      if (!next.has(p.id)) continue;
      for (const dep of p.depends_on) {
        if (!next.has(dep)) {
          next.add(dep);
          changed = true;
        }
      }
    }
  }
  return next;
}

function deselectPhase(phases: Phase[], selected: Set<string>, phaseId: string): Set<string> {
  const next = new Set(selected);
  next.delete(phaseId);
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of phases) {
      if (next.has(p.id) && p.depends_on.some((dep) => !next.has(dep))) {
        next.delete(p.id);
        changed = true;
      }
    }
  }
  return next;
}

export function reducer(state: DashboardState, action: Action): DashboardState {
  switch (action.type) {
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
    case "toggleGuardrail":
      return {
        ...state,
        guardrails: state.guardrails.map((g, i) => (i === action.index ? { ...g, on: !g.on } : g)),
      };
    case "dismissAction":
      return {
        ...state,
        chat: state.chat.map((m, i) => (i === action.index ? { ...m, action: null } : m)),
      };
    case "setAutonomyMode":
      return { ...state, autonomyMode: action.mode };
    case "togglePhase": {
      if (!state.plan || !state.planSelection) return state;
      const selected = state.planSelection.has(action.phaseId)
        ? deselectPhase(state.plan.phases, state.planSelection, action.phaseId)
        : selectPhase(state.plan.phases, state.planSelection, action.phaseId);
      return { ...state, planSelection: selected };
    }
    case "initRun":
      // Clears chat/selection/panel too, without this, switching to a
      // different run (e.g. opening a past run) would blend its backfilled
      // chat in with whatever was already on screen from the previous one.
      return {
        ...state,
        runId: action.runId,
        runState: action.runState,
        plan: action.plan,
        planSelection: action.plan ? new Set(action.plan.phases.map((p) => p.id)) : null,
        runs: {},
        chat: [],
        selected: null,
        panel: "analytics",
        usage: emptyUsage(),
        lastSeq: 0,
      };
    case "resetRun":
      return {
        ...state,
        runId: null,
        runState: null,
        plan: null,
        planSelection: null,
        panel: "analytics",
        selected: null,
        chat: [],
        runs: {},
        usage: emptyUsage(),
        lastSeq: 0,
      };
    case "setPastRuns":
      return { ...state, pastRuns: action.runs };
    case "addPastRun":
      return { ...state, pastRuns: [action.run, ...state.pastRuns] };
    case "say":
      return { ...state, chat: [...state.chat, { who: action.who, text: action.text }] };
    case "applyEvent":
      return applyEvent(state, action.event);
  }
}

function applyEvent(state: DashboardState, event: RunEventEnvelope): DashboardState {
  if (event.seq <= state.lastSeq) return state; // already applied (backfill overlap)
  let next: DashboardState = { ...state, lastSeq: event.seq };
  const payload = event.payload as Record<string, unknown>;

  switch (event.type) {
    case "plan.proposed": {
      const plan = payload as unknown as Plan;
      next = {
        ...next,
        plan,
        planSelection: new Set(plan.phases.map((p) => p.id)),
        runState: "awaiting_plan_approval",
        chat: [
          ...next.chat,
          {
            who: "CMO · now",
            text: `Here's the plan, ${plan.phases.length} phases across the team.`,
            action: planApprovalCard(),
          },
        ],
      };
      break;
    }
    case "plan.edited": {
      const plan = payload as unknown as Plan;
      next = { ...next, plan, planSelection: new Set(plan.phases.map((p) => p.id)) };
      break;
    }
    case "plan.approved":
      next = {
        ...next,
        runState: "running",
        planSelection: null,
        // Clears a stale Approve button if this event arrives via backfill
        // on reconnect, after the plan was already approved earlier.
        chat: next.chat.map((m) => (m.action?.kind === "approve_plan" ? { ...m, action: null } : m)),
      };
      break;
    case "plan.rejected":
      next = {
        ...next,
        chat: [...next.chat, { who: "CMO · now", text: "Got it, replanning given your feedback." }],
      };
      break;
    case "phase.started": {
      // Plan status is folded in regardless of scope_id: the phase list and
      // the PHASES DONE counter read from `plan`, not from the run cards.
      next = { ...next, plan: setPhaseStatus(next.plan, event.phase_id, "running") };
      if (!event.scope_id) break;
      next = {
        ...next,
        runs: upsertRun(next.runs, event.scope_id, {
          name: payload.assigned_agent as AgentName,
          task: (payload.title as string) ?? phaseTitle(next.plan, event.phase_id),
        }),
      };
      break;
    }
    case "phase.completed":
      next = { ...next, plan: setPhaseStatus(next.plan, event.phase_id, "completed") };
      break;
    case "phase.failed":
      next = { ...next, plan: setPhaseStatus(next.plan, event.phase_id, "failed") };
      break;
    case "phase.skipped":
      next = { ...next, plan: setPhaseStatus(next.plan, event.phase_id, "skipped") };
      break;
    case "scope.spawned": {
      if (!event.scope_id) break;
      next = {
        ...next,
        runs: upsertRun(next.runs, event.scope_id, {
          name: payload.agent_name as AgentName,
          task: phaseTitle(next.plan, event.phase_id),
          status: "running",
        }),
      };
      break;
    }
    case "step.started":
    case "step.completed": {
      if (!event.scope_id) break;
      const run = next.runs[event.scope_id];
      const label = (payload.label as string) ?? "";
      const lines = event.type === "step.started" ? (run?.lines ?? []) : [...(run?.lines ?? []), label].slice(-3);
      const steps = event.type === "step.completed" ? (run?.steps ?? 0) + 1 : (run?.steps ?? 0);
      const pct = event.type === "step.completed" ? Math.min(95, (run?.pct ?? 5) + 15) : (run?.pct ?? 5);
      next = { ...next, runs: upsertRun(next.runs, event.scope_id, { lines, steps, pct }) };
      break;
    }
    case "scope.completed":
      if (event.scope_id) {
        next = {
          ...next,
          runs: upsertRun(next.runs, event.scope_id, {
            status: "completed",
            pct: 100,
            summary: (payload.summary as string) ?? null,
          }),
        };
      }
      break;
    case "scope.summarised":
      if (event.scope_id) {
        next = {
          ...next,
          runs: upsertRun(next.runs, event.scope_id, {
            status: "stopped",
            summary: (payload.summary as string) ?? null,
          }),
        };
      }
      break;
    case "scope.failed":
      if (event.scope_id) {
        next = { ...next, runs: upsertRun(next.runs, event.scope_id, { status: "failed" }) };
      }
      break;
    case "chat.message":
      next = {
        ...next,
        chat: [
          ...next.chat,
          { who: `${(payload.who as string) ?? "YOU"} · now`, text: (payload.text as string) ?? "" },
        ],
      };
      break;
    case "chat.reply":
      next = {
        ...next,
        chat: [
          ...next.chat,
          { who: `${(payload.who as string) ?? "CMO"} · now`, text: (payload.text as string) ?? "" },
        ],
      };
      break;
    case "checkpoint.written":
      next = {
        ...next,
        chat: [
          ...next.chat,
          { who: "CMO · now", text: (payload.summary as string) ?? "Checkpoint saved." },
        ],
      };
      break;
    case "usage.recorded":
      next = { ...next, usage: addUsage(next.usage, payload as unknown as UsagePayload) };
      break;
    case "run.state_changed":
      next = { ...next, runState: ((payload.state as string) ?? next.runState) as BackendRunState };
      break;
    default:
      break;
  }
  return next;
}
