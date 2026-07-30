/** Wire types mirroring backend/app/schemas.py and lib/planner/schemas.py.
 * Kept hand-written (no codegen) since the backend is Python, this is the
 * one place drift between the two can happen, so keep it in sync with
 * docs/API.md when either side changes.
 */

export type AgentName =
  | "market_scout"
  | "seo_geo_analyst"
  | "community_scout"
  | "x_scout"
  | "linkedin_scout"
  | "content_writer"
  | "influencer";

export type AutonomyMode = "draft_only" | "plan_then_run" | "just_run";

export type RunState =
  | "queued"
  | "planning"
  | "awaiting_plan_approval"
  | "running"
  | "degraded"
  | "stopping"
  | "stopped"
  | "failed"
  | "completed";

export type PhaseStatus = "pending" | "running" | "completed" | "skipped" | "failed";

export type Phase = {
  id: string;
  title: string;
  intent: string;
  assigned_agent: AgentName;
  expected_outputs: string[];
  est_steps: number;
  depends_on: string[];
  status: PhaseStatus;
};

export type Plan = { phases: Phase[] };

export type RunSummary = { id: string; title: string; state: RunState; created_at: string };

export type RunOut = {
  id: string;
  title: string;
  state: RunState;
  autonomy_mode: AutonomyMode;
  current_phase_id: string | null;
  created_at: string;
  updated_at: string;
};

export type BootstrapResponse = {
  user: { id: string; email: string; name: string | null };
  runs: RunSummary[];
};

export type RunCreateResponse = { run: RunOut; plan: Plan };
export type RunDetailResponse = { run: RunOut; plan: Plan | null };

export type RunEventEnvelope = {
  run_id: string;
  seq: number;
  ts: string;
  scope_id: string | null;
  parent_scope_id: string | null;
  phase_id: string | null;
  type: string;
  payload: Record<string, unknown>;
};

export type ArtifactOut = {
  id: string;
  kind: string;
  title: string;
  format: string;
  version: number;
  created_at: string;
};

/** Payload of a `usage.recorded` event. `simulated` is load-bearing: the CMO
 * planning call reports real API usage, the dummy subagents emit synthetic
 * figures because they make no LLM call. The UI must keep the two visually
 * distinct; see MEMO.md. */
export type UsagePayload = {
  source: "cmo_planner" | "agent";
  agent_name: AgentName | null;
  model: string;
  simulated: boolean;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  total_tokens: number;
  cost_usd: number;
};

export type LedgerRow = {
  seq: number;
  kind: string;
  target: string;
  summary: string;
  ts: string;
};
