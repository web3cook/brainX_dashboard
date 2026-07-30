# API surface, brainX backend

**Status:** v0.1, for review before backend implementation begins
**Companion to:** `docs/ARCHITECTURE.md`, `docs/DB_SCHEMA.md`
**Base URL (local):** `http://localhost:8000`

---

## The transport model in one paragraph

A first-time visit to the dashboard is a plain REST call: the Next.js server calls `POST /bootstrap` with the signed-in user's email, gets back a user id and their run list, and the page renders from that, no socket exists yet. Once the dashboard is mounted, the client opens exactly one WebSocket for the whole session (`GET /live`) and multiplexes every run over it via `subscribe`/`unsubscribe` frames, receiving live chat replies and event streams and sending chat messages back. Every other action the operator takes, approving a plan, stopping a run, queuing a message, granting a publish approval, downloading an artifact, is a discrete REST call with its own HTTP response, never a fire-and-forget frame on the socket. This split exists because REST calls that must survive a flaky connection (stop, approve, queue) need a real response to know they landed; the socket is for the two things that are inherently a stream (chat, live events), not for control-plane actions.

---

## Error shape (all REST endpoints)

```jsonc
{
  "error": {
    "code": "not_found",          // machine-readable, stable
    "message": "Run abc123 not found."
  }
}
```

| HTTP status | `error.code` examples | When |
|---|---|---|
| 400 | `validation_error` | Malformed request body |
| 404 | `not_found` | Run/scope/approval/artifact id doesn't exist |
| 409 | `illegal_state_transition` | e.g. `POST /stop` on a run that's already `stopped` |
| 500 | `internal_error` | Unhandled, includes a `request_id` for correlating with logs |

---

## REST endpoints

### `POST /bootstrap`

First-visit call. Finds-or-creates the `users` row by email (see `docs/DB_SCHEMA.md`'s explicit non-production-auth note), returns enough to render the dashboard shell before any socket connects.

**Request**
```json
{ "email": "maya@acme.xyz", "name": "Maya Chen" }
```

**Response `200`**
```json
{
  "user": { "id": "uuid", "email": "maya@acme.xyz", "name": "Maya Chen" },
  "runs": [
    { "id": "uuid", "title": "Q3 inbound pipeline", "state": "running", "created_at": "..." }
  ]
}
```

---

### `POST /runs`

Create a run from a brief. Triggers the CMO planner (real Claude call) synchronously, the response includes the generated plan; the run starts in `planning` and moves to `awaiting_plan_approval` once the plan lands (or straight into it, same request/response cycle for this skeleton, planning is fast enough not to need its own async round trip).

**Request**
```json
{
  "title": "Q3 inbound pipeline",
  "brief": "We shipped the new API docs. Get us noticed by devs this week.",
  "autonomy_mode": "plan_then_run"
}
```

**Response `201`**
```json
{
  "run": {
    "id": "uuid",
    "title": "Q3 inbound pipeline",
    "state": "awaiting_plan_approval",
    "autonomy_mode": "plan_then_run",
    "created_at": "..."
  },
  "plan": {
    "phases": [
      {
        "id": "uuid",
        "title": "Understand the market",
        "intent": "Research competitors and find a positioning gap before writing anything.",
        "assigned_agent": "market_scout",
        "expected_outputs": ["competitor_summary", "positioning_gap"],
        "est_steps": 5,
        "depends_on": [],
        "status": "pending"
      }
    ]
  }
}
```
(Full `Phase` shape matches `ARCHITECTURE.md` §3.2 exactly: `id, title, intent, assigned_agent, expected_outputs, est_steps, depends_on, status`.)

---

### `GET /runs`

List the current user's runs (history). Query params: `limit`, `offset`.

**Response `200`**
```json
{ "runs": [ { "id": "uuid", "title": "...", "state": "...", "created_at": "..." } ] }
```

---

### `GET /runs/{id}`

Full run detail including the current plan.

**Response `200`**
```json
{
  "run": { "id": "uuid", "title": "...", "state": "running", "autonomy_mode": "plan_then_run",
           "current_phase_id": "uuid", "created_at": "...", "updated_at": "..." },
  "plan": { "phases": [ /* ... */ ] }
}
```

---

### `GET /runs/{id}/events?since={seq}`

Backfill, returns every `run_events` row with `seq > since`, in order. Used by the WebSocket handshake (§ below) and available standalone for polling/debugging.

**Response `200`**
```json
{
  "events": [
    { "run_id": "uuid", "seq": 41, "ts": "...", "scope_id": "uuid", "parent_scope_id": null,
      "phase_id": "uuid", "type": "step.completed", "payload": { "label": "Read Acme's pricing page" } }
  ]
}
```

---

### `POST /runs/{id}/plan/approve`

Approve the current plan, optionally with edits (reorder/delete/rewrite a phase, PRD R2.2).

**Request**
```json
{ "edited_plan": { "phases": [ /* full replacement Plan, or omit for as-is approval */ ] } }
```

**Response `200`**, `{ "run": { "state": "running", ... } }`. Emits `plan.approved` (and `plan.edited` first, if `edited_plan` was sent).

---

### `POST /runs/{id}/plan/reject`

**Request**, `{ "note": "Skip Reddit entirely, we don't have a presence there yet." }`
**Response `200`**, run returns to `planning`; the CMO re-plans given the note. Emits `plan.rejected`.

---

### `POST /runs/{id}/stop`

**Dedicated REST endpoint, never accepted over the WebSocket, by design (see transport paragraph above).**

**Request**, empty body.
**Response `202`**, `{ "run": { "state": "stopping" } }`, returned within the PRD's 500ms acknowledgement budget. The run reaches `stopped` (with a checkpoint and CMO-generated summary) asynchronously; the client observes that transition via the `run.state_changed` event on the open WebSocket, not by polling this endpoint.

---

### `POST /runs/{id}/resume`

**Request**, `{ "redirect": "Skip Reddit, go deeper on LinkedIn ICP" }` (redirect is optional, omit for a plain resume from checkpoint).
**Response `200`**, if a redirect was given, returns a **revised** plan for approval (state → `awaiting_plan_approval` again) with each phase marked `keep | discard | revised | new` per `ARCHITECTURE.md` §6.3; if no redirect, resumes directly (state → `running`).

```json
{
  "run": { "state": "awaiting_plan_approval" },
  "plan": {
    "phases": [
      { "id": "uuid", "title": "Understand the market", "status": "keep", "...": "..." },
      { "id": "uuid", "title": "Seed Reddit threads", "status": "discard", "...": "..." },
      { "id": "uuid", "title": "Deepen LinkedIn ICP research", "status": "new", "...": "..." }
    ]
  }
}
```

---

### `POST /runs/{id}/messages`

Queue a message mid-run (PRD R2.5). Delivered at the next phase boundary, never mid-phase.

**Request**, `{ "body": "Also check our Discord for launch chatter" }`
**Response `201`**, `{ "message": { "id": "uuid", "state": "queued", "deliver_after_phase_id": "uuid|null" } }`

### `DELETE /runs/{id}/messages/{mid}`

Cancel a queued message before it's delivered. **Response `200`** if still `queued`, **`409`** if already `delivered`.

---

### `PATCH /runs/{id}/autonomy`

Change autonomy mode mid-run. **Request**, `{ "autonomy_mode": "just_run" }`. **Response `200`**.

---

### `POST /approvals/{id}/grant`

**Request**, `{ "edited_payload": { /* optional, operator-edited version of the proposed action */ } }`
**Response `200`**, `{ "approval": { "state": "granted" } }`. Emits `approval.granted` (and `approval.edited` first, if edited).

### `POST /approvals/{id}/deny`

**Request**, `{ "reason": "Too promotional for that subreddit's rules" }`
**Response `200`**, `{ "approval": { "state": "denied" } }`.

---

### `GET /runs/{id}/artifacts`

**Response `200`**
```json
{ "artifacts": [ { "id": "uuid", "kind": "keyword_table", "title": "Docs SEO gap analysis",
                    "format": "csv", "version": 1, "created_at": "..." } ] }
```

### `GET /artifacts/{id}/download`

Returns the raw `content` with the appropriate `Content-Type` (`text/markdown` or `text/csv`) and a `Content-Disposition: attachment` header.

---

### `GET /runs/{id}/ledger`

Read/write/publish ledger (PRD R3.4), backed by `tool_ledger`.

**Response `200`**
```json
{ "ledger": [
  { "seq": 12, "kind": "read", "target": "https://acme.com/pricing",
    "summary": "Read Acme's pricing page", "ts": "..." }
] }
```

---

## WebSocket, `GET /live`

**One socket per operator session, not per run.** The client opens this once when the dashboard mounts and keeps it for the whole session, multiplexing every run it cares about over it. Switching runs is a frame on the existing connection, not a reconnect. Every outbound frame carries `run_id` so the client can route it.

### Inbound (client → server)

```jsonc
{ "type": "subscribe",    "run_id": "uuid", "since": 0 }   // backfill from `since`, then tail live
{ "type": "unsubscribe",  "run_id": "uuid" }                // stop delivering this run
{ "type": "chat.message", "run_id": "uuid", "body": "we are launching a new feature this week" }
```

`since` works exactly like `GET /runs/{id}/events?since=`, `0` on first subscribe; on reconnect the client passes its last-applied `seq` so the server replays only what was missed. Nothing else is accepted inbound: stop, resume, approvals, and queued messages are REST-only (see transport paragraph above), and any other `type` is ignored.

### Outbound (server → client)

**1. `subscribed`**, acknowledges a subscribe, sent before that run's backfill burst:
```jsonc
{ "type": "subscribed", "run_id": "uuid" }
```

**2. `event`**, a verbatim `run_events` row, tagged with the run it belongs to:
```jsonc
{ "type": "event", "run_id": "uuid", "event": {
  "run_id": "uuid", "seq": 1247, "ts": "2026-07-30T10:14:22.881Z",
  "scope_id": "uuid", "parent_scope_id": null, "phase_id": "uuid",
  "type": "step.started", "payload": { "label": "Reading Acme's pricing page", "kind": "read" }
} }
```

Chat turns (`chat.message`, `chat.reply`) and run-state transitions (`run.state_changed`) are ordinary events inside this envelope, there is no separate top-level frame type for them.

### Event `type` values that appear inside outbound `event` frames

Reused verbatim from `ARCHITECTURE.md` §4.3, with a note on what this dummy-agent skeleton actually emits:

| Family | Types | Emitted by |
|---|---|---|
| Run | `run.created`, `run.state_changed`, `run.completed`, `run.failed` | orchestrator |
| Plan | `plan.proposed`, `plan.edited`, `plan.approved`, `plan.rejected`, `plan.revised` | CMO planner (real Claude call) |
| Phase | `phase.started`, `phase.completed`, `phase.skipped`, `phase.failed` | orchestrator |
| Scope | `scope.spawned`, `scope.summarised`, `scope.completed`, `scope.failed` | agent process (`BaseAgent`) |
| Step | `step.started`, `step.completed`, `step.failed`, `step.retrying` | agent process, dummy steps only, `step.failed`/`step.retrying` not exercised by the dummy agents in this pass (no fixture-failure-injector yet) |
| Finding | `finding.recorded` | agent process, for a step whose `significance` is `finding` |
| Artifact | `artifact.created`, `artifact.updated` | agent process, for canned deliverables |
| Usage | `usage.recorded` | CMO planner (real API-reported usage, `simulated: false`) and agent processes (synthetic, `simulated: true`, dummy agents make no LLM call; see MEMO.md) |
| Approval | `approval.requested`, `approval.edited`, `approval.granted`, `approval.denied` | orchestrator / REST handlers |
| Message | `message.queued`, `message.cancelled`, `message.delivered` | REST handlers / orchestrator (delivery at phase boundary) |
| Control | `stop.requested`, `checkpoint.written`, `summary.generated`, `resume.requested` | orchestrator + CMO (real Claude call for the summary) |
| Health | `model.degraded`, `model.recovered` | CMO planner only, dummy agents have no model calls to degrade |

---

## What this skeleton deliberately does not implement yet

- No signed-token verification on `/bootstrap` (see `docs/DB_SCHEMA.md`).
- No pagination cursor on `GET /runs/{id}/events` beyond `since` (fine at skeleton event volumes).
- No rate limiting on any endpoint.
- The fixture failure-injector (`ARCHITECTURE.md` §8) that would exercise `step.failed`/`model.degraded` on purpose is not built this pass, dummy agents always succeed.
