# brainX — backend, AI CMO, database, and dummy agent skeleton

## Context

`docs/PRD.md` and `docs/ARCHITECTURE.md` (already written, PRD confirmed "fine" as-is) describe an AI CMO growth-ops harness: a FastAPI + Postgres backend where a real orchestrator plans a brief into structured phases and delegates to five subagents, with an append-only event log as the system of record. Right now none of that exists — `backend/` and `agents/` are empty, and the `frontend/` dashboard is 100% client-side mocked (`useReducer` + `setInterval`, zero network calls), built earlier from a Figma-style import before this backend design existed.

The user wants to actually build the skeleton now: a real backend, a real database, a real AI-CMO orchestrator that makes a genuine Claude API call to plan, and five **dummy** subagents — real OS processes with a real lifecycle (spawn, receive instructions, do bounded fake work, emit events, exit) but producing canned data rather than calling real external platforms. Agents must be interruptible via SIGINT: on stop, they write their own state to a file, record that file's path in Postgres themselves, and exit cleanly. The existing frontend dashboard gets wired to this real backend over REST (first-visit bootstrap + most commands) and one WebSocket (chat + live run events, replacing the doc's original SSE design). The goal is explicitly a *skeleton that showcases the thinking*, not a fully-realized product — depth is intentionally in the plumbing (event log, process lifecycle, real planning call), not in agent intelligence or full UI fidelity.

Decisions locked in with the user before this plan:
- Frontend gets wired to real data this pass (not backend-only), **plus** two small additions on top of the existing UI shape: a plan-approval action-card and a 3-option autonomy selector. No full three-layer timeline / approval-tray / deliverables-panel rebuild — those stay explicitly deferred.
- Postgres runs locally via Docker Compose.
- The CMO's planning step makes a real Anthropic Claude API call (structured/validated output), not a template.
- `POST /runs/{id}/stop` is a dedicated REST endpoint, never sent over the WebSocket.
- Python 3.12 is not installed on this machine (only 3.9.6) — the backend + agent processes run entirely inside Docker Compose, so host Python version is irrelevant and `docker compose up` is reproducible for a reviewer.

**Correction to note**: PRD.md's own subagent roster is exactly five — Market Scout, SEO/GEO Analyst, Community Scout, Outreach Scout, Content Writer — identical to ARCHITECTURE.md's diagram. There is no PRD/architecture mismatch. The only mismatch is the frontend's *current mock* catalog in `lib/dashboard/agents.ts` (SEO, GEO, X, LinkedIn, Reddit, Writer, Influencer, "UGC Video" — 8 channel-named entries with no PRD basis), which gets replaced by the real 5.

---

## 1. `docs/ARCHITECTURE.md` edits

Amend, don't rewrite, these sections:
- **§2 diagram + stack table**: `SSE (events)` → `WebSocket (bidirectional: chat + events)`. `Runner` row: "in-process asyncio tasks" → "asyncio orchestrator spawning per-subagent OS subprocesses, SIGINT-based cancellation."
- **§4.2/§5 `scopes` table**: add `task_brief jsonb`, `checkpoint_path text`, `checkpoint_state text`.
- **§5 Data model**: add a `users` table (email-keyed, found-or-created on bootstrap) and resolve `runs.user_id`'s FK target; flag explicitly that there is no verified auth bridge between Next.js and FastAPI in this pass — bootstrap trusts whatever email it's given.
- **§6.1 Execution model**: subagents are now real subprocesses (own PID, own Postgres connection), not nested async calls; note the container-restart-as-supervisor shortcut (see §5 below) in place of PID tracking.
- **§6.2 Cooperative cancellation**: add process-boundary cancellation via `loop.add_signal_handler(SIGINT, ...)` alongside the existing tool-call-boundary token cancellation — both coexist.
- **§7 API surface**: SSE section → WebSocket envelope (inbound/outbound message types below); add `POST /bootstrap` to the REST table.
- **§9 Frontend architecture**: `useRunStream` (SSE) → `useRunSocket` (WebSocket); note this pass keeps the flat run-card UI plus the two added signature moments, with the full Phase/Scope/Step tree, autonomy ladder, approval tray, and deliverables panel explicitly deferred.
- **§11 Build sequence**: replace/augment the Day 1–3 split with the milestone list in §7 below.

---

## 2. Backend file tree (`backend/`)

```
backend/
  Dockerfile                    # python:3.12-slim
  requirements.txt               # fastapi, uvicorn[standard], sqlalchemy[asyncio], asyncpg,
                                  #   psycopg[binary] (Alembic sync), alembic, anthropic,
                                  #   pydantic-settings, websockets
  alembic.ini
  app/
    main.py                      # app factory, CORS, router mounts, lifespan (engine + LISTEN)
    config.py                    # pydantic Settings: DATABASE_URL, ANTHROPIC_API_KEY,
                                  #   CORS_ORIGIN, CHECKPOINT_DIR
    db/
      base.py                    # async engine/session factory
      models.py                  # Run, RunEvent, Scope, Checkpoint, Artifact, Approval,
                                  #   QueuedMessage, ToolLedger, User (SQLAlchemy ORM)
      migrations/
        env.py
        versions/0001_initial.py # full schema incl. §4 deltas below
    routers/
      bootstrap.py                # POST /bootstrap
      runs.py                      # /runs CRUD, plan approve/reject, stop, resume, autonomy
      approvals.py                 # grant/deny
      artifacts.py                  # list/download
      ledger.py                      # /runs/{id}/ledger
      ws.py                           # WS /runs/{id}/live
    orchestrator/
      supervisor.py                   # RunSupervisor: one asyncio Task/run, drives phases
      agent_process.py                 # spawn/track subprocess per scope, send SIGINT on stop
      event_bus.py                      # append_event() + Postgres LISTEN/NOTIFY fanout
    planner/
      cmo_planner.py                     # propose_plan() — the one real Claude call (§6)
      schemas.py                          # Pydantic Plan/Phase (shared shape w/ ARCHITECTURE §3.2)
      prompts.py
```

---

## 3. `agents/` file tree — fully self-contained package

No imports from `backend/`. Each agent process opens its own `asyncpg` connection directly (matching the user's explicit ask: the agent itself writes its checkpoint pointer to Postgres, not the orchestrator on its behalf). This avoids any fragile shared-PYTHONPATH setup between two separately-invoked entrypoints.

```
agents/
  __init__.py
  base.py          # BaseAgent lifecycle: on_start, run() [abstract], step(), on_finish(),
                    #   on_interrupt() — see §5
  runner.py         # CLI entry: `python -m agents.runner --scope-id <uuid> --run-id <uuid>`
                     #   resolves agent_name -> class, wires SIGINT handler, opens asyncpg conn
  db.py              # ~30 lines: connect(), fetch_task_brief(scope_id), insert_event(...),
                      #   update_scope_checkpoint(scope_id, path, state)
  fixtures.py          # canned per-namespace dummy payloads + sample_latency(300, 2500)
  market_scout.py        # research.* — competitor list, positioning gaps
  seo_geo_analyst.py      # seo.*/geo.* — keyword gaps, SERP position, citation coverage
  community_scout.py       # reddit.* — subreddits, threads, reply drafts
  outreach_scout.py         # social.* — LinkedIn/X people worth contacting
  content_writer.py          # content.* — draft posts/replies/ad copy
```

---

## 4. Postgres schema (deltas beyond `ARCHITECTURE.md` §5, applied via Alembic)

```sql
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE runs ADD COLUMN user_id uuid REFERENCES users(id);

ALTER TABLE scopes
  ADD COLUMN task_brief jsonb,
  ADD COLUMN checkpoint_path text,
  ADD COLUMN checkpoint_state text NOT NULL DEFAULT 'none';  -- none | partial | complete
```

The rest of the schema (`runs`, `run_events`, `scopes` base columns, `checkpoints`, `artifacts`, `approvals`, `queued_messages`, `tool_ledger`) is exactly `ARCHITECTURE.md` §5 as already written.

**Explicit shortcut**: `/bootstrap` finds-or-creates a `users` row by whatever email the Next.js server sends it, with no signed-token verification between services. Fine for a single-operator local demo; not production auth.

---

## 5. Agent process model (the SIGINT/checkpoint mechanism)

- **Spawn**: orchestrator INSERTs a `scopes` row (`task_brief` populated, state=`spawned`) then `asyncio.create_subprocess_exec(sys.executable, "-m", "agents.runner", "--scope-id", str(id), "--run-id", str(run_id))`. One subprocess per subagent invocation — fresh spawn per task, not a long-lived worker pool.
- **Instructions delivery**: the CLI arg is only `--scope-id`; the agent's first action is `SELECT task_brief FROM scopes WHERE id = $1`. Keeps the CLI invocation tiny and stable, and reuses the one identifier for both reading instructions in and writing the checkpoint pointer back out.
- **`BaseAgent` hook interface** (`agents/base.py`):
  ```python
  class BaseAgent(ABC):
      async def on_start(self, instructions: dict) -> None: ...      # emits scope.spawned
      @abstractmethod
      async def run(self, instructions: dict) -> None: ...           # dummy work loop
      async def step(self, label: str, kind: str, significance: str, payload: dict) -> None:
          ...  # sample_latency(), then INSERT run_events + NOTIFY
      async def on_finish(self, summary: str) -> None: ...           # scope.completed
      async def on_interrupt(self) -> None: ...                      # SIGINT path, see below
  ```
  Each of the 5 concrete agents subclasses this and implements only `run()` as a short list of canned `step()` calls appropriate to its role.
- **Catching SIGINT cleanly**: `loop.add_signal_handler(signal.SIGINT, stop_event.set)` — not raw `signal.signal` — so the handler safely triggers an `asyncio.Event` the agent's step loop checks between steps (mirrors `ARCHITECTURE.md` §6.2's existing "check at boundaries" principle, at process granularity instead of task granularity). On interrupt: write `${CHECKPOINT_DIR}/{run_id}/{scope_id}.json` (steps completed, partial findings, interrupted-at timestamp) to the shared Docker volume, `UPDATE scopes SET checkpoint_path=..., checkpoint_state='partial', state='stopped'`, close the connection, `sys.exit(0)`.
- **Orchestrator's send side**: `process.send_signal(signal.SIGINT)` — never `terminate()`/SIGKILL on the happy path; a grace-timeout fallback to SIGKILL exists only if the process doesn't exit within a few seconds.
- **Flagged, accepted risk**: if the `api` container restarts, child agent processes become orphans. Mitigation for this skeleton: on API startup, reconcile any `scopes` row left `running`/`spawned` with no live process to `state='orphaned'`; more importantly, `docker compose restart api` kills the whole process group including children, so container lifecycle *is* the supervisor for this POC (named explicitly as a shortcut, not an oversight).

---

## 6. CMO planner (real Claude call)

- One async function, `propose_plan(brief, autonomy_mode, checkpoint=None) -> Plan` in `planner/cmo_planner.py` — the orchestrator only ever calls this; the real API call, retry, and fallback all live inside it, so it stays swappable.
- Forced tool-use call (`propose_plan` tool) whose input schema is generated from the `Plan`/`Phase` Pydantic models (`.model_json_schema()`), matching `ARCHITECTURE.md` §3.2's `Phase(id, title, intent, assigned_agent, expected_outputs, est_steps, depends_on, status)` shape exactly so it slots directly into the orchestrator's data model.
- On validation failure or phase count outside 3–7 (`ARCHITECTURE.md` §10's own risk-mitigation), retry once with the validation error appended to the prompt; on a second failure, fall back to a fixed 3-phase template.
- Before implementing, consult the `claude-api` skill for the current model id and request conventions rather than guessing from memory.

---

## 7. Docker Compose (repo root: `docker-compose.yml`)

Two services — `db` (postgres:16, healthcheck, named volume) and `api` (built from `backend/Dockerfile`, bind-mounted source for `uvicorn --reload`, `agent_state` named volume for checkpoint files, `ANTHROPIC_API_KEY` passed through, `depends_on: db: condition: service_healthy`). `agents/` is copied/mounted into the same image as `backend/` — the API process spawns agent subprocesses as children of itself, not as separate Compose services. Frontend stays on host Node (`npm run dev`), talking to `http://localhost:8000`.

---

## 8. REST + WebSocket surface

**REST** (all from `ARCHITECTURE.md` §7, plus `/bootstrap`):
`POST /bootstrap`, `POST /runs`, `GET /runs`, `GET /runs/{id}`, `GET /runs/{id}/events?since=`, `POST /runs/{id}/plan/approve`, `POST /runs/{id}/plan/reject`, `POST /runs/{id}/stop`, `POST /runs/{id}/resume`, `POST /runs/{id}/messages`, `DELETE /runs/{id}/messages/{mid}`, `PATCH /runs/{id}/autonomy`, `POST /approvals/{id}/grant`, `POST /approvals/{id}/deny`, `GET /runs/{id}/artifacts`, `GET /artifacts/{id}/download`, `GET /runs/{id}/ledger`.

**WebSocket** — `GET /runs/{id}/live?since={seq}`: server first backfills `run_events WHERE seq > $1` as a burst, then tails live via Postgres LISTEN/NOTIFY.
- Inbound: `{"type":"chat.message","body":"..."}` only (stop/resume/messages/approvals stay REST — a fire-and-forget WS frame is the wrong transport for anything that must survive a flaky connection or needs a real HTTP response).
- Outbound: `{"type":"event","event":{...run_events envelope verbatim...}}`, `{"type":"chat.reply","who":"CMO","text":"...","ts":"..."}`, `{"type":"run.state","state":"RUNNING","current_phase_id":"..."}`.

---

## 9. Frontend rewire

Keep the existing dashboard's visual shape; drive it from real data; add the two signature moments.

- **New** `frontend/lib/api/client.ts` — fetch wrapper for the REST surface above.
- **New** `frontend/lib/api/useRunSocket.ts` — opens `/runs/{id}/live`, exposes `{events, chat, runState, sendChat}`, owns reconnect-with-backfill via `since`.
- **Rewrite** `frontend/lib/dashboard/state.ts` — reducer's `tick`/`stop`/`resume`/`approve` stop synthesizing fake progress; new `applyEvent(event)` action folds a real `run_events` envelope into the existing `Run` shape. `initialState` becomes an empty/loading shell, populated by `/bootstrap` + the socket.
- **Remap** `frontend/lib/dashboard/agents.ts` — replace the 8 mock channel-agents with the real 5 (Market Scout, SEO/GEO Analyst, Community Scout, Outreach Scout, Content Writer); cascades into `AgentPicker.tsx`, `RunCard.tsx`, and `view.ts`'s `pickerView`/`benchView`/`rosterView`.
- **`DashboardApp.tsx`** — replace the `setInterval` tick effect with `useRunSocket`; replace `cmoSay`'s fake `setTimeout` with real inbound `chat.reply` frames; `stopRun`/`resumeRun` call the REST client.
- **Two new pieces, reusing existing patterns**:
  - *Plan approval*: when the CMO proposes a plan, it renders using the **existing chat action-card** component (`ChatAction`/`confirmChatAction` already in `DashboardApp.tsx` — no new component needed) listing phases with Approve / edit-and-approve / Reject.
  - *Autonomy selector*: a small 3-button control (Draft only / Plan then run / Just run it) shown once, at brief-submission time in the composer.
- **`frontend/app/page.tsx`** — after `auth()`, call `/bootstrap` (server-side or via a client effect) instead of rendering against static `initialState`.

Explicitly still deferred (events exist server-side, no UI yet): the three-layer Phase→Task→Step collapsible timeline, a non-blocking approval tray with badge count, the deliverables panel, ledger view, mid-run autonomy changes.

---

## 10. Build order

1. Postgres schema + Alembic migration + `docker compose up` (db+api healthy) + `/bootstrap` — proves the spine comes up clean.
2. One dummy agent standalone (`base.py` + `market_scout.py` + `runner.py`), invoked directly via CLI, manually `kill -INT <pid>`'d — proves the full agent lifecycle in isolation before wiring anything else.
3. CMO planner: real Claude call, `POST /runs` → validated `Plan` visible via `GET /runs/{id}` — no execution yet.
4. Orchestrator wiring: `RunSupervisor` spawns the one dummy agent per approved phase, events flow, `GET /runs/{id}/events?since=` backfill works — via REST polling only.
5. WebSocket: `/runs/{id}/live` replacing polling — backfill + live tail + inbound chat.
6. SIGINT/checkpoint path end-to-end through the real `POST /runs/{id}/stop` — sequenced *after* the WebSocket so the demo can watch the stop happen live.
7. Remaining four dummy agents — mechanical repeats of step 2's pattern.
8. Frontend wiring last: `client.ts` → `useRunSocket.ts` → `state.ts` rewrite → `agents.ts` remap → `DashboardApp.tsx` → plan-approval card → autonomy selector → `app/page.tsx` bootstrap call.

---

## Verification

- `docker compose up` brings up `db` (healthy) and `api` (FastAPI on :8000) with no manual steps; `alembic upgrade head` runs automatically or as a documented one-liner.
- `curl -X POST localhost:8000/bootstrap -d '{"email":"test@x.com"}'` returns a user + empty run list.
- `curl -X POST localhost:8000/runs -d '{"brief":"...", "autonomy_mode":"plan_then_run"}'` returns a real Claude-generated `Plan` with 3–7 phases.
- Approve the plan; watch `scopes`/`run_events` rows populate in Postgres as the orchestrator spawns `agents/market_scout.py` (and once built, the other four).
- Open the WebSocket (`wscat` or a small test script) against `/runs/{id}/live?since=0`; confirm it backfills then tails live frames matching Postgres.
- `docker exec` into the `api` container, find a running agent subprocess PID (`ps aux`), `kill -INT <pid>` manually first, then via `POST /runs/{id}/stop` — confirm a checkpoint JSON file appears under the `agent_state` volume and `scopes.checkpoint_path`/`checkpoint_state` update accordingly.
- `npm run dev` in `frontend/`, visit the dashboard signed in via Google, confirm: bootstrap loads real (empty) state, submitting a brief shows the autonomy selector then a real plan-approval action-card, approving it shows real dummy-agent run cards streaming live (not the old canned mock data), and Stop hits the real REST endpoint and the card reflects the real `STOPPED` state.
- `tsc --noEmit`, `eslint`, and `next build` still pass in `frontend/` after the rewrite.
