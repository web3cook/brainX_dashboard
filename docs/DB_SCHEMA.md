# Database schema — brainX backend

**Status:** v0.1, for review before backend implementation begins
**Companion to:** `docs/ARCHITECTURE.md`, `docs/API.md`
**Engine:** Postgres 16, applied via Alembic migrations from `backend/app/db/migrations/`

This is the complete, concrete DDL — not deltas. `ARCHITECTURE.md` §5 sketched the original shape; this document is the single source of truth for the actual schema going into the first migration. `uuid_generate_v4()`/`gen_random_uuid()` requires the `pgcrypto` extension, enabled in migration `0001_initial`.

---

## Design notes before the DDL

- **State columns are `text` + `CHECK`, not native `ENUM` types.** Postgres enums are painful to extend (`ALTER TYPE ... ADD VALUE` can't run inside a transaction in older versions, and dropping a value is not supported at all). A `CHECK` constraint is one `ALTER TABLE` away from changing, which matters for a skeleton where the state machine may still shift. The valid values are enumerated per-column below and must match `ARCHITECTURE.md`'s state machine diagram exactly.
- **No triggers, no auto-`updated_at`.** Application code sets timestamps explicitly. Keeps the schema legible for a reviewer without hunting for trigger functions.
- **`run_events` is genuinely append-only.** No `UPDATE`/`DELETE` grants are modeled here (that's an application/role concern, not enforced at the DDL level for this skeleton) — but no code path should ever update or delete a row in this table. Everything else derives from it.
- **Agents write to `scopes` and `run_events` directly** (per `docs/ARCHITECTURE.md` §6's process model) — they hold their own short-lived `asyncpg` connection, separate from the API's SQLAlchemy pool.

---

## `users`

Bridges the Next.js Auth.js session to a backend row. **Deliberate shortcut**: found-or-created by email on `POST /bootstrap` with no signed-token verification between the two services — acceptable for a single-operator local demo, not production auth.

```sql
CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text UNIQUE NOT NULL,
  name        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

---

## `runs`

One row per operator brief. `plan` holds the CMO's current `Plan` object (see `docs/API.md` for its JSON shape) as a single JSONB blob — the plan is versioned by replacing this column wholesale (`plan.revised` events capture the history in `run_events`, not here).

```sql
CREATE TABLE runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id),
  title              text NOT NULL,
  brief              text NOT NULL,
  autonomy_mode      text NOT NULL
                       CHECK (autonomy_mode IN ('draft_only','plan_then_run','just_run')),
  state              text NOT NULL DEFAULT 'queued'
                       CHECK (state IN (
                         'queued','planning','awaiting_plan_approval',
                         'running','degraded','stopping','stopped',
                         'failed','completed'
                       )),
  current_phase_id   uuid,                 -- FK to a phase inside `plan`, not a separate table
  plan               jsonb,                -- current Plan object, or null before planning completes
  last_seq           bigint NOT NULL DEFAULT 0,   -- last run_events.seq written for this run
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz
);

CREATE INDEX idx_runs_user_id ON runs (user_id, created_at DESC);
```

---

## `run_events`

The system of record. Every other table is a projection or index over this one. Envelope matches `ARCHITECTURE.md` §4.2 exactly.

```sql
CREATE TABLE run_events (
  run_id            uuid NOT NULL REFERENCES runs(id),
  seq               bigint NOT NULL,        -- monotonic per run; doubles as the WS/SSE event id
  ts                timestamptz NOT NULL DEFAULT now(),
  scope_id          uuid,                   -- which agent frame emitted this; null = CMO orchestrator
  parent_scope_id   uuid,                   -- null = top-level (CMO)
  phase_id          uuid,
  type              text NOT NULL,          -- e.g. 'step.started' — see docs/API.md for the full list
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (run_id, seq)
);

CREATE INDEX idx_run_events_scope   ON run_events (run_id, scope_id);
CREATE INDEX idx_run_events_type    ON run_events (run_id, type);
```

`seq` is assigned by the application (`SELECT last_seq + 1 FROM runs WHERE id = $1 FOR UPDATE`, insert, then update `runs.last_seq`) inside one transaction, so it stays strictly monotonic per run even with concurrent agent processes writing events.

---

## `scopes`

One row per agent frame — the CMO orchestrator itself does not get a row (it's the implicit root, `parent_scope_id IS NULL` in `run_events`); a row exists per **subagent process invocation**. Extended beyond `ARCHITECTURE.md`'s original sketch with the three columns the agent-process/SIGINT model needs.

```sql
CREATE TABLE scopes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid NOT NULL REFERENCES runs(id),
  parent_scope_id    uuid REFERENCES scopes(id),
  agent_name         text NOT NULL
                        CHECK (agent_name IN (
                          'market_scout','seo_geo_analyst','community_scout',
                          'x_scout','linkedin_scout','content_writer','influencer'
                        )),
  phase_id           uuid,
  state              text NOT NULL DEFAULT 'spawned'
                        CHECK (state IN (
                          'spawned','running','awaiting_approval',
                          'completed','failed','stopped','orphaned'
                        )),
  task_brief         jsonb NOT NULL,        -- instructions the agent process reads at startup
  summary            text,                  -- the one-line collapse shown when the scope completes
  checkpoint_path    text,                  -- filesystem path written by the agent on SIGINT
  checkpoint_state   text NOT NULL DEFAULT 'none'
                        CHECK (checkpoint_state IN ('none','partial','complete')),
  pid                integer,               -- OS process id, for the orphan-reconciliation check
  started_at         timestamptz NOT NULL DEFAULT now(),
  ended_at           timestamptz
);

CREATE INDEX idx_scopes_run_id    ON scopes (run_id);
CREATE INDEX idx_scopes_parent    ON scopes (parent_scope_id);
CREATE INDEX idx_scopes_state     ON scopes (run_id, state);  -- orphan-reconciliation query on API startup
```

---

## `checkpoints`

Run-level checkpoint — distinct from a `scopes.checkpoint_path` (which is one agent's raw state file). This is the CMO's assembled view across all scopes, written at every phase boundary and on stop, per `ARCHITECTURE.md` §6.3.

```sql
CREATE TABLE checkpoints (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                uuid NOT NULL REFERENCES runs(id),
  seq                   bigint NOT NULL,     -- run_events.seq this checkpoint corresponds to
  reason                text NOT NULL
                          CHECK (reason IN ('stop','phase_boundary','failure')),
  completed_phases      jsonb NOT NULL DEFAULT '[]'::jsonb,
  findings              jsonb NOT NULL DEFAULT '{}'::jsonb,
  partial_phase_state   jsonb,
  agent_memory          jsonb,
  summary_text          text,                -- the CMO's plain-language stop summary (real Claude call)
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_checkpoints_run_id ON checkpoints (run_id, created_at DESC);
```

---

## `artifacts`

Deliverables produced during a run (P5, thin per PRD §5.5).

```sql
CREATE TABLE artifacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      uuid NOT NULL REFERENCES runs(id),
  scope_id    uuid REFERENCES scopes(id),
  kind        text NOT NULL
                CHECK (kind IN ('strategy_doc','keyword_table','post_draft','outreach_list','influencer_list')),
  title       text NOT NULL,
  format      text NOT NULL CHECK (format IN ('markdown','csv','json')),
  content     text NOT NULL,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_artifacts_run_id ON artifacts (run_id, created_at DESC);
```

---

## `approvals`

Per-action publish approvals (PRD §5.3). **Not** a run state — the run stays `running` while an approval is `pending`; only `blocks_phase_id` (if set) parks that one downstream branch.

```sql
CREATE TABLE approvals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid NOT NULL REFERENCES runs(id),
  scope_id           uuid REFERENCES scopes(id),
  action_type        text NOT NULL,          -- e.g. 'reddit.post_reply', 'linkedin.send_post'
  proposed_payload   jsonb NOT NULL,
  edited_payload     jsonb,
  preview            jsonb,
  state              text NOT NULL DEFAULT 'pending'
                       CHECK (state IN ('pending','granted','denied','expired')),
  blocks_phase_id    uuid,                   -- null = run continues freely
  requested_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at        timestamptz
);

CREATE INDEX idx_approvals_pending ON approvals (run_id, state) WHERE state = 'pending';
```

---

## `queued_messages`

Mid-run operator messages, delivered at the next phase boundary (PRD R2.5).

```sql
CREATE TABLE queued_messages (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                 uuid NOT NULL REFERENCES runs(id),
  body                   text NOT NULL,
  state                  text NOT NULL DEFAULT 'queued'
                           CHECK (state IN ('queued','delivered','cancelled')),
  queued_at              timestamptz NOT NULL DEFAULT now(),
  deliver_after_phase_id uuid,
  delivered_at           timestamptz
);

CREATE INDEX idx_queued_messages_run_id ON queued_messages (run_id, state);
```

---

## `tool_ledger`

Denormalized projection of `step.*` events, purely for the fast "what it touched" read (PRD R3.4) without scanning all of `run_events`. Populated by the same application code that appends the underlying `step.completed` event — this is a read-optimization, not a second system of record.

```sql
CREATE TABLE tool_ledger (
  run_id    uuid NOT NULL REFERENCES runs(id),
  seq       bigint NOT NULL,
  kind      text NOT NULL CHECK (kind IN ('read','write','publish')),
  target    text NOT NULL,   -- e.g. a URL, a subreddit, a recipient handle
  summary   text NOT NULL,   -- the same human label the event carried
  ts        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, seq)
);

CREATE INDEX idx_tool_ledger_run_id ON tool_ledger (run_id, ts);
```

---

## State machine reference (for column `CHECK` values above)

Matches `ARCHITECTURE.md` §3.1 exactly — reproduced here so the schema and the doc can't silently drift:

```
QUEUED → PLANNING → AWAITING_PLAN_APPROVAL → RUNNING ⇄ DEGRADED
                                                  │
                                                  ├──▶ STOPPING → STOPPED ──(resume)──▶ RUNNING
                                                  ├──▶ FAILED ──(resume)──▶ RUNNING
                                                  └──▶ COMPLETED
```

(Lowercased in the DB: `queued`, `planning`, `awaiting_plan_approval`, `running`, `degraded`, `stopping`, `stopped`, `failed`, `completed`.)

---

## Migration plan

Single migration for this skeleton: `backend/app/db/migrations/versions/0001_initial.py` creates every table above, in the order listed (respects FK dependencies: `users` → `runs` → everything else). No seed data. `alembic upgrade head` is run automatically by the `api` container's entrypoint before `uvicorn` starts.
