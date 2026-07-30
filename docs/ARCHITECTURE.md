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
            │ REST (bootstrap + commands)  │ WebSocket
            │                              │ (chat + live events,
            ▼                              ▼  one socket per open run)
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
│  ┌─────────────────────┐  │   │  users, runs, run_events,    │
│  │ CMO Agent Loop      │  │   │  scopes, checkpoints,         │
│  │  spawns OS process  │  │   │  artifacts, approvals,        │
│  │  per subagent task: │  │   │  queued_messages, tool_ledger │
│  │   ├ Market Scout    │  │   └──────────────────────────────┘
│  │   ├ SEO/GEO Analyst │  │
│  │   ├ Community Scout │  │   ┌──────────────────────────────┐
│  │   ├ X Scout         │  │   │  agents/ (separate package)   │
│  │   ├ Linkedin Scout  │  │   │  one Python subprocess per     │
│  │   ├ Content Writer  │  │   │  subagent invocation, SIGINT-  │
│  │   └ Influencer      │  │   │  interruptible, own Postgres   │
│  └─────────────────────┘  │   │  connection, dummy fixture     │
│  SIGINT sent to stop a    │   │  data for this build pass      │
│  running subagent process │   └──────────────────────────────┘
└───────────────────────────┘
```

See `docs/DB_SCHEMA.md` for the complete table DDL and `docs/API.md` for the full REST + WebSocket contract — both superseded the sketches originally inlined in §5 and §7 below, which now just summarize and link out.

**Stack decisions:**

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Next.js 16 + React 19 + Tailwind v4 | Already scaffolded in repo. |
| Backend | Python 3.12 + FastAPI + asyncio | Best agent ecosystem; native async fits concurrent subagents and subprocess supervision. Runs inside Docker (host only has Python 3.9) — see §12. |
| DB | Postgres 16 + SQLAlchemy (async) + Alembic | Durable run state. `JSONB` for event payloads. `LISTEN/NOTIFY` for cross-process event fanout. |
| Transport | REST (bootstrap + commands) + one WebSocket per run | Chat is bidirectional, so a unidirectional stream (the original SSE plan) no longer fits once chat and the event stream share a connection. The WebSocket carries chat + live events; every command that must survive a flaky connection or needs a real HTTP response (stop, approve, resume, queue/cancel a message, grant/deny an approval) stays REST. Full contract in `docs/API.md`. |
| Runner | Orchestrator asyncio tasks, each spawning a real OS subprocess per subagent invocation | Subagents are interruptible via `SIGINT`, not just an in-process cancellation token — this is what lets a stopped agent checkpoint itself and exit cleanly (§6.2). Boundary is drawn so a queue (Celery/Arq) could still slot in later without touching the API. |

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

Full DDL lives in `docs/DB_SCHEMA.md` — this section only summarizes what changed from the original sketch and why.

Nine tables: `users`, `runs`, `run_events`, `scopes`, `checkpoints`, `artifacts`, `approvals`, `queued_messages`, `tool_ledger`. Two additions beyond the original design:

- **`users`** — didn't exist originally; `runs.user_id` had nothing to reference. Found-or-created by email on `POST /bootstrap`, with **no signed-token verification** between the Next.js session and this backend in this build pass. Acceptable for a single-operator local demo; called out explicitly so it isn't mistaken for an oversight later.
- **`scopes` gains `task_brief jsonb`, `checkpoint_path text`, `checkpoint_state text`, `pid integer`** — the process-based agent model (§6.2) needs somewhere for an agent to read its own instructions at spawn (`task_brief`) and somewhere to point at the state file it writes on `SIGINT` (`checkpoint_path`/`checkpoint_state`). `pid` supports a best-effort orphan-reconciliation check on API startup.

State columns (`runs.state`, `scopes.state`, `checkpoint_state`, etc.) are `text` + `CHECK`, not native Postgres `ENUM` — easier to extend with a plain migration while this is still moving.

---

## 6. Orchestrator design

### 6.1 Execution model

```
RunSupervisor (one asyncio Task per run, in-process)
  ├ owns the run's root CancellationToken (for the CMO's own in-process work:
  │   planning calls, phase sequencing — see §6.2a)
  ├ drives the phase sequence from the approved plan
  ├ checkpoints at every phase boundary
  └ for each phase, per assigned subagent:
        AgentProcess ── asyncio.create_subprocess_exec ──▶ real OS process
          (python -m agents.runner --scope-id <uuid> --run-id <uuid>)
          · reads its own task_brief from its `scopes` row at startup — no
            history passed in-band; the brief itself is the only context
          · owns its own asyncpg connection (separate from the API's pool)
          · appends its own step.*/finding.* events directly to run_events
          · interruptible via SIGINT, not a shared in-process token (§6.2b)
```

This replaced the original in-process `AgentFrame(subagent)` design: subagents are now real child processes with their own PID, not nested async calls sharing the orchestrator's memory space. The reasons a subagent still only receives a task brief (never the parent's full history) are unchanged from the original design — it keeps the process's own working set small, and it's still *why* the UI can collapse it to one line honestly: that line is the agent's actual return value, not a UI-side summarisation.

**Concurrency:** phases with no `depends_on` relationship run concurrently, bounded by a semaphore (default 3) — now a cap on *simultaneous OS processes*, not just async tasks. This is what produces the two-cards-updating-side-by-side moment in the demo, and it also bounds the direct-Postgres-connection count from §6.2b to a small, known number.

**Accepted risk, stated plainly:** if the `api` container restarts while subagent processes are its children, those children are reparented (orphaned) rather than cleanly torn down. Mitigation for this build: on API startup, any `scopes` row left `spawned`/`running` with no matching live PID is marked `orphaned`; more substantively, restarting the whole `api` container (not just the API process inside it) kills the entire process group, so container lifecycle is standing in for a real process supervisor (Celery/Arq) in this POC.

### 6.2 Cancellation — two mechanisms, one per execution model

**(a) Tool-call-boundary token cancellation** — unchanged from the original design, and still what governs the CMO orchestrator's own in-process work (the planning call, phase sequencing):

```python
async def run_tool(self, call, token):
    token.raise_if_cancelled()                  # 1: before dispatch
    result = await asyncio.wait_for(
        self.registry.dispatch(call), timeout=TOOL_TIMEOUT)
    token.raise_if_cancelled()                  # 2: after return
    return result
```

**(b) Process-boundary SIGINT cancellation** — new, and what governs a running subagent process:

```python
# inside agents/runner.py, at process startup
stop_event = asyncio.Event()
loop.add_signal_handler(signal.SIGINT, stop_event.set)   # not raw signal.signal —
                                                          # a raw handler can't safely
                                                          # await, which is exactly the
                                                          # "poll a flag" trap this avoids
...
for step in self.canned_steps():
    if stop_event.is_set():
        await self.on_interrupt()   # write checkpoint file, update scopes row, exit(0)
        return
    await self.step(...)
```

The orchestrator sends `SIGINT` (never `terminate()`/`SIGKILL` on the happy path — a grace-timeout fallback to `SIGKILL` exists only if a process doesn't exit within a few seconds). This is the direct realization of "stop must checkpoint before it exits": the check-between-steps loop above plays exactly the role `token.raise_if_cancelled()` plays in (a), just at process granularity instead of task granularity — the two mechanisms are the same *principle* (check at known boundaries, never kill mid-step) applied to two different concurrency primitives.

An in-flight step is allowed to finish before the check runs (steps are bounded, same as tool calls in (a)). If a stop lands mid-step, the UI shows "Finishing one last lookup, then stopping" — satisfying the PRD R2.6 latency budget honestly rather than lying about instant cancellation.

Cancellation still propagates parent → child: the orchestrator sends SIGINT to every live subagent process for a run being stopped. Each one gets its `on_interrupt()` call — the process equivalent of "one final chance to emit `scope.summarised` with partial findings" — before exiting, so a stopped run still yields usable work.

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

Full endpoint-by-endpoint request/response contract lives in `docs/API.md`. Summary:

- **`POST /bootstrap`** — the first-visit REST call. Finds-or-creates the operator's `users` row by email, returns their run list, renders the dashboard shell before any socket exists.
- **REST commands** — `/runs` (create/list/detail/events-backfill), plan approve/reject, `/runs/{id}/stop` (dedicated endpoint, deliberately **never** accepted over the WebSocket — see below), `/runs/{id}/resume`, queue/cancel a message, `PATCH .../autonomy`, approvals grant/deny, artifacts list/download, the read/write/publish ledger.
- **`GET /runs/{id}/live`** — the one **WebSocket**, opened after bootstrap. Replaces the original SSE design because chat is inherently bidirectional: this single socket carries the live event stream *and* chat outbound, and accepts `chat.message` inbound. Handshake takes `?since={seq}`, backfills via the same `run_events WHERE seq > $1` query the original SSE reconnect used, then tails live. Every other inbound action (stop, approve, resume, queue) is deliberately REST, not a WS frame — those need a real HTTP response to be trustworthy over a flaky connection, which a fire-and-forget socket message doesn't give you.

**Cross-process fanout:** unchanged — Postgres `LISTEN/NOTIFY` on `run_events_channel`. Works with multiple API workers without adding Redis, and works identically whether the frontend is listening over WebSocket or polling the backfill endpoint directly.

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

### Target shape (unchanged in spirit, transport renamed)

```
app/runs/[id]/page.tsx
  useRunSocket(runId)             → WebSocket + backfill, returns event list + chat
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

### What this build pass actually implements

The dashboard predates this backend design (built from a Figma-style import) and has a flat run-cards-plus-tabs shape rather than the `app/runs/[id]` Phase/Scope/Step tree above. Rather than a UI redesign in the same pass as standing up the backend, this build keeps that existing shape and drives it from real data:

- `lib/api/useRunSocket.ts` replaces the mocked `setInterval` tick loop with the real WebSocket above.
- `lib/dashboard/state.ts`'s reducer gains an `applyEvent(event)` action that folds one real `run_events` row into the existing flat `Run` shape — a `Run` here is closest to a **Scope**, not a Phase; there is no phase-level grouping yet.
- Two small additions land **on top of the existing shape**, reusing components that already exist rather than building new ones: a plan-approval moment (the chat's existing action-card component, `ChatAction`/`confirmChatAction`) and a 3-option autonomy selector at brief-submission time.

**Explicitly deferred** (the backend emits the underlying events; no UI renders them in the target shape yet): the collapsible Phase→Task→Step timeline, the non-blocking `ApprovalTray` with badge count, `DeliverablesPanel`, the ledger view, and mid-run autonomy changes. This gap is intentional and named, not an oversight — see `docs/API.md` for the event types that already exist server-side, ready for that UI whenever it's built.

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

## 11. Build sequence — this skeleton pass

Superseded by milestones, not days, since the toolchain/topology decisions (Docker-only Python 3.12, subprocess-based agents, dummy agent intelligence) reshape what's actually buildable first:

1. **Spine** — Postgres schema + Alembic migration, `docker compose up` (db+api healthy), `POST /bootstrap` working.
2. **One dummy agent, standalone** — `agents/base.py` + `agents/market_scout.py` + `agents/runner.py`, invoked directly via CLI and manually `kill -INT`'d, proving the full spawn → work → checkpoint-on-SIGINT → exit lifecycle in isolation.
3. **CMO planner** — the one real Claude call; `POST /runs` returns a validated `Plan`; no execution yet.
4. **Orchestrator wiring** — `RunSupervisor` spawns the dummy agent per approved phase; events flow; backfill via REST polling only, no socket yet.
5. **WebSocket** — `/runs/{id}/live` replaces polling; backfill + live tail + inbound chat.
6. **Stop → SIGINT → checkpoint end-to-end**, through the real `POST /runs/{id}/stop` — sequenced *after* the socket exists specifically so the demo can watch the stop happen live.
7. **Remaining four dummy agents** — mechanical repeats of step 2's pattern.
8. **Frontend wiring** — API client, `useRunSocket`, the `state.ts` reducer rewrite, the agent-roster remap, `DashboardApp.tsx` wiring, the plan-approval card, the autonomy selector.

Ship-order rule, unchanged from the original plan and still true here: **the stop/resume loop lands before approval polish.** It remains the differentiator and the thing any demo should be built around.
