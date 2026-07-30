# HLD — brainX harness architecture

**Status:** v0.1
**Companion to:** `docs/PRD.md`

---

## 1. Guiding principles

1. **The event log is the system of record.** The UI is a projection of an append-only event stream. Nothing is true because it is on screen; it is on screen because it is in the log. This is what makes reconnect, resume, replay, and audit all the same mechanism rather than four features.
2. **The agent process must be interruptible at known boundaries.** Cooperative cancellation at tool-call boundaries, not process kills. A killed process cannot write a checkpoint, and the checkpoint is the product.
3. **Semantics live in the backend, not the renderer.** The frontend must never parse tool names to decide how to display something. The orchestrator emits already-humanised events; the UI arranges them.
4. **Subagent isolation is structural.** A subagent gets its own context, its own event scope, and its own cancellation token. Nesting in the UI is a direct reflection of nesting in execution.

---

## 2. System context

```
┌─────────────────────────────────────────────────────────────┐
│  Browser — Next.js 16 (App Router, React 19, Tailwind v4)   │
│                                                              │
│  RunView          Timeline projector    Deliverables panel   │
│  Composer         Approval tray         Autonomy control     │
└───────────┬──────────────────────────────┬──────────────────┘
            │ REST (commands)              │ SSE (events)
            ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│  FastAPI — Harness API                                      │
│  ┌──────────────┬──────────────┬───────────────────────┐    │
│  │ Run Control  │ Event Bus    │ Approval Service      │    │
│  └──────────────┴──────────────┴───────────────────────┘    │
└───────────┬──────────────────────────────┬──────────────────┘
            │                              │
            ▼                              ▼
┌───────────────────────────┐   ┌──────────────────────────────┐
│  Orchestrator (asyncio)   │   │  Postgres                    │
│  ┌─────────────────────┐  │   │  runs, run_events,           │
│  │ CMO Agent Loop      │  │   │  checkpoints, artifacts,      │
│  │   ├ Market Scout    │  │   │  approvals, queued_messages   │
│  │   ├ SEO/GEO Analyst │  │   └──────────────────────────────┘
│  │   ├ Community Scout │  │
│  │   ├ Outreach Scout  │  │   ┌──────────────────────────────┐
│  │   └ Content Writer  │  │   │  Tool Registry               │
│  └─────────────────────┘  │   │  research/seo/geo/reddit/     │
│  Cancellation tree        │   │  social/content/workspace     │
└───────────────────────────┘   │  → Fixture layer (mocked)     │
                                └──────────────────────────────┘
```

**Stack decisions:**

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Next.js 16 + React 19 + Tailwind v4 | Already scaffolded in repo. |
| Backend | Python 3.12 + FastAPI + asyncio | Best agent ecosystem; native async fits concurrent subagents and SSE. |
| DB | Postgres 16 + SQLAlchemy (async) + Alembic | Durable run state. `JSONB` for event payloads. `LISTEN/NOTIFY` for cross-process event fanout. |
| Streaming | SSE | Unidirectional server→client is the actual shape. Commands go over REST. Simpler than WebSocket, survives proxies, has native reconnect with `Last-Event-ID`. |
| Runner | In-process asyncio tasks | POC scope. Boundary is drawn so a queue (Celery/Arq) can slot in later without touching the API. |

---

## 3. The run lifecycle

### 3.1 State machine

```
                    ┌──────────┐
                    │  QUEUED  │
                    └────┬─────┘
                         ▼
                   ┌──────────┐
              ┌───▶│ PLANNING │
              │    └────┬─────┘
              │         ▼
              │  ┌──────────────────┐   reject + note
              │  │ AWAITING_PLAN_   │──────────┐
              │  │ APPROVAL         │          │
              │  └────┬─────────────┘          │
              │       │ approve (± edits)      │
              │       ▼                        │
              │  ┌──────────┐                  │
              │  │ RUNNING  │◀────────┐        │
              │  └──┬───┬───┴─┐       │        │
              │     │   │     │       │        │
              │     │   │     ▼       │        │
              │     │   │  ┌──────────┴──┐     │
              │     │   │  │  DEGRADED   │     │  (model error / rate limit,
              │     │   │  └─────────────┘     │   auto-retry w/ backoff)
              │     │   │                      │
              │     │   ▼ stop requested       │
              │     │ ┌───────────┐            │
              │     │ │ STOPPING  │            │
              │     │ └─────┬─────┘            │
              │     │       ▼ checkpoint+summary written
              │     │ ┌───────────┐            │
              └─────┴─│  STOPPED  │            │
                redirect└─────────┘            │
                                               │
              ┌──────────┐   ┌──────────┐      │
              │  FAILED  │   │COMPLETED │      │
              └────┬─────┘   └──────────┘      │
                   └─── resume ────────────────┘
```

Notes:

- `AWAITING_PUBLISH_APPROVAL` is **not** a run state. Approvals are per-action, tracked in the `approvals` table, and the run stays `RUNNING` (PRD R3.3). Only the specific dependent branch parks.
- `DEGRADED` is distinct from `FAILED`: recoverable, auto-retrying, visible countdown.
- Both `STOPPED` and `FAILED` guarantee a valid checkpoint before entry.

### 3.2 Phase model

The plan the CMO produces is a first-class object, not prose:

```python
Plan(
  phases=[
    Phase(id, title, intent, assigned_agent, expected_outputs,
          est_steps, depends_on=[phase_ids], status)
  ]
)
```

This buys three things at once:

- **Progress estimation** — "phase 3 of 5" is real, not fabricated from a token count.
- **Editable approval** — the operator edits a structured object, not a paragraph.
- **Resume granularity** — a checkpoint is "phases 1–2 complete, phase 3 partial", which is exactly what the operator needs told.

---

## 4. The event log

### 4.1 Why append-only

One structure serves: live streaming, tab-close reconnect, resume-after-stop, post-hoc audit, and the read/write ledger. Deriving all five from one log is far less code than five features, and they cannot drift out of sync.

### 4.2 Event envelope

```jsonc
{
  "run_id": "uuid",
  "seq": 1247,                      // monotonic per run; the SSE event id
  "ts": "2026-07-30T10:14:22.881Z",
  "scope_id": "uuid",               // which agent frame emitted this
  "parent_scope_id": "uuid|null",   // null = the CMO orchestrator
  "phase_id": "uuid|null",
  "type": "step.started",
  "payload": { ... }
}
```

`scope_id` / `parent_scope_id` is the entire subagent nesting mechanism. The frontend builds a tree by grouping on scope, never by guessing from tool names. Interleaved arrival is fine — the tree structure is carried in the data, so two concurrent subagents render as two coherent cards without any reordering logic in the client (PRD R1.3).

### 4.3 Event types

| Family | Types |
|---|---|
| Run | `run.created`, `run.state_changed`, `run.completed`, `run.failed` |
| Plan | `plan.proposed`, `plan.edited`, `plan.approved`, `plan.rejected`, `plan.revised` |
| Phase | `phase.started`, `phase.completed`, `phase.skipped`, `phase.failed` |
| Scope | `scope.spawned`, `scope.summarised`, `scope.completed`, `scope.failed` |
| Step | `step.started`, `step.completed`, `step.failed`, `step.retrying` |
| Finding | `finding.recorded` |
| Artifact | `artifact.created`, `artifact.updated` |
| Approval | `approval.requested`, `approval.edited`, `approval.granted`, `approval.denied` |
| Message | `message.queued`, `message.cancelled`, `message.delivered` |
| Control | `stop.requested`, `checkpoint.written`, `summary.generated`, `resume.requested` |
| Health | `model.degraded`, `model.recovered` |

### 4.4 Humanisation happens at emit time

`step.started` payload:

```jsonc
{
  "label": "Reading Acme's pricing page",     // for Maya
  "kind": "read",                             // read | write | publish
  "significance": "routine",                  // routine | finding | milestone
  "tool": "research.fetch_page",              // technical detail, hidden by default
  "args": { "url": "https://acme.com/pricing" }
}
```

The tool registry declares `label_template`, `kind`, and `significance` per tool. The renderer stays dumb; adding a tool never requires a frontend change (Principle 3). `significance` drives PRD R1.6 — routine steps recede, findings stay.

---

## 5. Data model (Postgres)

```sql
runs (
  id uuid PK, user_id, title, brief text,
  autonomy_mode text,               -- draft_only | plan_then_run | just_run
  state text, current_phase_id uuid,
  plan jsonb, last_seq bigint,
  created_at, updated_at, completed_at
)

run_events (
  run_id uuid FK, seq bigint,
  ts timestamptz, scope_id uuid, parent_scope_id uuid,
  phase_id uuid, type text, payload jsonb,
  PRIMARY KEY (run_id, seq)
)
-- INDEX (run_id, scope_id), (run_id, type)

scopes (                             -- one row per agent frame
  id uuid PK, run_id uuid FK, parent_scope_id uuid,
  agent_name text, phase_id uuid,
  state text, summary text,          -- the one-line collapse (PRD R1.3)
  started_at, ended_at
)

checkpoints (
  id uuid PK, run_id uuid FK, seq bigint,
  reason text,                       -- stop | phase_boundary | failure
  completed_phases jsonb, findings jsonb,
  partial_phase_state jsonb, agent_memory jsonb,
  summary_text text, created_at
)

artifacts (
  id uuid PK, run_id uuid FK, scope_id uuid,
  kind text,                         -- strategy_doc | keyword_table | post_draft | outreach_list
  title text, format text,           -- markdown | csv | json
  content text, version int, created_at
)

approvals (
  id uuid PK, run_id uuid FK, scope_id uuid,
  action_type text, proposed_payload jsonb,
  edited_payload jsonb, preview jsonb,
  state text,                        -- pending | granted | denied | expired
  blocks_phase_id uuid,              -- null = run continues freely
  requested_at, resolved_at
)

queued_messages (
  id uuid PK, run_id uuid FK, body text,
  state text,                        -- queued | delivered | cancelled
  queued_at, deliver_after_phase_id uuid, delivered_at
)

tool_ledger (                        -- projection of step events, for PRD R3.4
  run_id uuid FK, seq bigint, kind text,
  target text, summary text, ts timestamptz
)
```

---

## 6. Orchestrator design

### 6.1 Execution model

```
RunSupervisor (one asyncio Task per run)
  ├ owns the run's root CancellationToken
  ├ drives the phase sequence from the approved plan
  ├ checkpoints at every phase boundary
  └ for each phase:
        AgentFrame (CMO)  ── spawns ──▶ AgentFrame (subagent)
          · own message history (isolated context)
          · own scope_id
          · child CancellationToken
          · own tool allowlist (namespace-scoped)
```

**Context isolation:** a subagent receives only a task brief and the specific findings it needs — never the parent's full history. It returns a structured result plus a one-line summary. This keeps contexts small, and it is also *why* the UI can collapse a subagent to one line honestly: that line is the actual return value, not a UI-side summarisation.

**Concurrency:** phases with no `depends_on` relationship run concurrently, bounded by a semaphore (default 3). This is what produces the two-cards-updating-side-by-side moment in the demo.

### 6.2 Cooperative cancellation

Cancellation checks happen at three boundaries only:

1. Before dispatching a tool call
2. After a tool call returns
3. Before each model inference

```python
async def run_tool(self, call, token):
    token.raise_if_cancelled()                  # 1
    result = await asyncio.wait_for(
        self.registry.dispatch(call), timeout=TOOL_TIMEOUT)
    token.raise_if_cancelled()                  # 2
    return result
```

An in-flight tool call is allowed to finish (they are bounded by `TOOL_TIMEOUT`, default 10s). If a stop lands during one, the UI immediately shows "Finishing one last lookup, then stopping" — satisfying the PRD R2.6 latency budget with honesty rather than a lie about instant cancellation.

Cancellation propagates parent → child through the token tree. Each cancelled subagent gets one final chance to emit `scope.summarised` with its partial findings, so a stopped run still yields usable work.

### 6.3 Stop → summary → resume

```
1. POST /runs/{id}/stop
2. API sets stop_requested, emits stop.requested        ← UI acknowledges <500ms
3. Supervisor cancels the token tree
4. Subagents unwind, each emitting partial findings
5. Supervisor assembles a Checkpoint:
     - completed phases + their findings
     - partial state of the interrupted phase
     - artifacts produced so far
6. One LLM call generates the stop summary:
     "Here's what I did, what I found, what I was about to do"
7. checkpoint.written + summary.generated emitted
8. state → STOPPED. UI: "What should we do differently?"
```

**Resume with redirect:**

```
POST /runs/{id}/resume  { redirect: "Skip Reddit, go deeper on LinkedIn ICP" }

1. Load latest checkpoint
2. Re-plan: CMO receives (original brief + checkpoint findings + redirect)
   and produces a revised plan, explicitly marking each phase:
       KEEP     — already done, findings still valid, will not re-run
       DISCARD  — invalidated by the redirect
       REVISED  — carried forward with changed instructions
       NEW      — added because of the redirect
3. Emit plan.revised. UI shows the keep/discard diff.
4. Operator approves. state → RUNNING, resuming at the first non-KEEP phase.
```

That KEEP/DISCARD marking is the concrete answer to "redirect without throwing away what it has already done" — the operator can *see* the work being preserved, rather than being told it was.

### 6.4 Queued message delivery

Messages are injected at phase boundaries, never mid-phase. Rationale: mid-phase injection corrupts subagent context and produces incoherent behaviour, which reads to the operator as the agent ignoring them. Delivering at a clean boundary means the message *visibly* changes the next phase — better feedback, less magic. The UI states the contract plainly: "Will be read when the current phase finishes."

If a queued message would substantially change the plan, the CMO re-plans and re-requests approval (unless mode is `just_run`).

---

## 7. API surface

### Commands (REST)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/runs` | Create from a brief + autonomy mode |
| `GET` | `/runs` | List (history) |
| `GET` | `/runs/{id}` | Run detail + current plan |
| `GET` | `/runs/{id}/events?since={seq}` | Backfill for reconnect |
| `POST` | `/runs/{id}/plan/approve` | Approve, optionally with edited plan |
| `POST` | `/runs/{id}/plan/reject` | Reject with a note |
| `POST` | `/runs/{id}/stop` | Request stop |
| `POST` | `/runs/{id}/resume` | Resume, optionally with a redirect |
| `POST` | `/runs/{id}/messages` | Queue a message |
| `DELETE` | `/runs/{id}/messages/{mid}` | Cancel a queued message |
| `PATCH` | `/runs/{id}/autonomy` | Change mode mid-run |
| `POST` | `/approvals/{id}/grant` | Approve, optionally with an edited payload |
| `POST` | `/approvals/{id}/deny` | Deny with a reason |
| `GET` | `/runs/{id}/artifacts` | List deliverables |
| `GET` | `/artifacts/{id}/download` | Download |
| `GET` | `/runs/{id}/ledger` | What it read / wrote / published |

### Stream (SSE)

```
GET /runs/{id}/stream          Last-Event-ID: <seq>
```

Server replays from `seq+1`, then tails live. Reconnect is native browser behaviour plus a `WHERE seq > $1` query. This is why tab-close survival is nearly free architecturally, even though we are not polishing that UI (PRD §4 cut).

**Cross-process fanout:** Postgres `LISTEN/NOTIFY` on `run_events_channel`. Works with multiple API workers without adding Redis.

---

## 8. Tool registry & fixtures

```python
@tool(
  namespace="reddit",
  name="find_threads",
  kind="read",
  significance="finding",
  label="Searching r/{subreddit} for relevant discussions",
  timeout_s=10,
)
async def find_threads(subreddit: str, query: str) -> list[Thread]: ...
```

The decorator is what keeps the frontend dumb: `label`, `kind`, and `significance` are declared once at the tool and travel with every event.

**Fixture layer.** Every external call goes through `FixtureBackend`, which:

- Returns realistic canned data keyed by argument shape
- Simulates latency (300–2500ms, sampled) so the timeline animates like real work
- Honours a **failure injector** (`FAILURE_MODE=tool_fail:reddit.find_threads`) — this is how the demo breaks things on purpose, deterministically, on camera

Every fixture-backed namespace is listed in `MEMO.md`. The agent loop, tool dispatch, subagent spawning, cancellation, and checkpointing are all real.

---

## 9. Frontend architecture

```
app/runs/[id]/page.tsx
  useRunStream(runId)            → SSE + backfill, returns event list
  useTimelineProjection(events)  → folds events into a Phase/Scope/Step tree
  ├ RunHeader                    → the "right now" line (PRD R1.2)
  ├ AutonomyControl
  ├ Timeline
  │   └ PhaseSection             → auto-collapses on completion
  │       └ ScopeCard            → subagent; collapses to one-line summary
  │           └ StepRow          → expandable to raw detail
  ├ ApprovalTray                 → non-blocking, badge count
  ├ DeliverablesPanel
  └ Composer                     → send | queue | stop | redirect (context-aware)
```

**Projection is pure and idempotent.** `events → tree` is a fold with no side effects, so replaying 2,000 backfilled events produces exactly the same tree as having streamed them live. Reconnect correctness is then a property of the function, not something to test per-scenario.

**Rendering cost.** At 60+ steps with sub-second updates, naive re-rendering will jank. Mitigations: virtualised step lists inside expanded scopes, `React.memo` on `StepRow` keyed by `seq`, and event batching on a `requestAnimationFrame` tick.

---

## 10. Known risks

| Risk | Mitigation |
|---|---|
| LLM produces a vague plan → phase progress becomes meaningless | Constrain planning to a structured schema; validate phase count 3–7; retry the planning call on schema failure |
| Concurrent subagents make the timeline illegible | Cap at 3; test legibility at 2/3/5 before locking the default |
| Stop summary generation adds latency at the worst moment | Emit checkpoint *before* summary; UI shows "Stopped — writing up what I found" with the structured checkpoint already visible |
| Resume re-plan discards work it should have kept | Make KEEP/DISCARD explicit and operator-approvable rather than automatic |
| Event volume degrades the browser | Virtualisation + rAF batching; server-side cap on `step` events per scope |

---

## 11. Build sequence (3 days)

**Day 1 — spine.** Postgres schema + migrations; event log write/read; SSE stream with backfill; run supervisor with a hardcoded 3-phase plan; timeline projection rendering a real (fake-tooled) run end to end.

**Day 2 — depth and control.** Real agent loop + planning; subagents with isolated context and scope nesting; full tool registry + fixtures; collapse/expand behaviour; stop → checkpoint → summary → redirect → resume; queued messages.

**Day 3 — trust and polish.** Publish approvals with preview and inline edit; non-blocking approval tray; failure states and the failure injector; deliverables panel; visual pass; MEMO.md; demo video.

Ship-order rule: **the stop/resume loop lands before approvals.** It is the differentiator and the thing the video is built around.
