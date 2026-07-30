# brainX

An AI CMO you can watch, stop, and redirect.

A browser workspace where a marketing operator briefs an AI CMO in plain language, watches it plan and delegate deep multi-step growth work across seven specialist subagents, and can interrupt it at any moment without losing what it already learned.

Built as a take-home for the X-ARC Agentic AI Engineer assignment. **The harness is the point**, not the agent. See [`MEMO.md`](MEMO.md) for design decisions, what's cut, and an up-front disclosure of what's stubbed.

---

## What's real vs. stubbed

Read [`MEMO.md`](MEMO.md) first. It's the honest version. The short form:

- **Real:** the CMO's planning call (live Claude Opus 5, structured output, prompt-cached), token/cost metering off that call's actual reported usage, Postgres as an append-only event log, one OS subprocess per subagent invocation, `SIGINT`-based cancellation with real checkpoint files, one session-scoped WebSocket multiplexing every run with seq-based reconnect/backfill.
- **Stubbed:** the seven subagents themselves. They run canned steps and return fixture data. No Reddit, LinkedIn, X or SERP API is called anywhere, and they make no LLM calls, so their token and cost figures are **simulated** (flagged `SIM` in the UI). Free-form chat is templated except for a few DB-backed status questions.

---

## Quick start

**Prerequisites:** Docker Desktop, and an Anthropic API key.

```bash
# 1. Backend + DB key
cp .env.example .env
#    → set ANTHROPIC_API_KEY in .env

# 2. Frontend secrets (compose reads this file directly, it must exist)
cp frontend/.env.example frontend/.env.local
#    → set AUTH_SECRET (npx auth secret) and Google OAuth creds

# 3. Everything up
docker compose up --build
```

Then open **http://localhost:3000** and sign in with Google.

| Service | URL | Notes |
|---|---|---|
| Frontend | http://localhost:3000 | Next.js dev server, source bind-mounted |
| API | http://localhost:8000 | FastAPI; `/docs` for OpenAPI, `/health` for liveness |
| Postgres | `localhost:5432` | `brainx` / `brainx_dev`, db `brainx` |

Migrations run automatically on `api` startup (`alembic upgrade head`). To reset all data: `docker compose down -v`.

> Google OAuth needs `http://localhost:3000/api/auth/callback/google` registered as an authorized redirect URI.

---

## Driving it

1. Type a brief (e.g. *"we're launching a pricing page next week, drum up awareness"*) and pick an autonomy mode: **draft only** / **plan then run** / **just run it**.
2. The CMO makes a real Claude call and returns a 3 to 7 phase plan.
3. **Choose which phases to run**, the approval card is a checklist. Deselecting a phase automatically drops anything depending on it; selecting one pulls its prerequisites back in.
4. Approve. Agents spawn as real subprocesses (3 concurrent max) and stream live steps.
5. **Stop mid-flight**, every live agent catches `SIGINT`, writes a checkpoint file, records the path in Postgres, and exits cleanly. **Resume** re-spawns those same scopes, and each agent picks up from its checkpoint rather than redoing completed steps.

Close the tab and come back, the run is still there, and the socket backfills everything you missed.

---

## Architecture

```
Next.js 16 (App Router, React 19, Tailwind v4, Auth.js v5)
    │  REST for commands · one session WebSocket (chat + live events, all runs)
    ▼
FastAPI  ──►  RunSupervisor (asyncio)  ──►  agents.runner subprocesses ×N
    │              │                             │
    │              └── SIGINT to stop ───────────┘
    ▼
Postgres 16, run_events is the system of record; everything derives from it
```

The `agents/` package is deliberately standalone, it imports nothing from `backend/` and opens its own `asyncpg` connection, because each agent is an independently-invoked process (`python -m agents.runner --scope-id … --run-id …`), not an import-time dependency of the API.

**Docs:** [`docs/PRD.md`](docs/PRD.md) · [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/DB_SCHEMA.md`](docs/DB_SCHEMA.md) · [`docs/API.md`](docs/API.md)

---

## Layout

```
backend/          FastAPI app, routers, orchestrator, planner, SQLAlchemy models + Alembic
agents/           Standalone subagent package: base lifecycle, CLI runner, 7 dummy agents
frontend/         Next.js dashboard, api client, WS hook, event-driven reducer, components
docs/             PRD, architecture, DB schema, API contract
MEMO.md           Design decisions, cuts, failure states, disclosures
docker-compose.yml
```

### The seven subagents

`market_scout` · `seo_geo_analyst` · `community_scout` · `x_scout` · `linkedin_scout` · `content_writer` · `influencer`

This roster is enforced in four places that must stay in sync: the `scopes.agent_name` CHECK constraint, the planner's `AgentName` literal, the CMO's system prompt, and the frontend's `AGENTS` catalog.

---

## Development

```bash
docker compose logs -f api        # run lifecycle, agent spawns, per-step agent output
docker compose logs -f frontend   # browser console is forwarded here too
docker compose restart api        # also kills orphaned agent subprocesses

cd frontend && npx tsc --noEmit && npx eslint .
```

The frontend logs every API call (`[api]`), socket frame (`[ws]`), and operator action (`[dashboard]`) to the browser console; the backend logs every state transition and agent subprocess lifecycle event.

**Adding a subagent:** create `agents/<name>.py` subclassing `BaseAgent` (implement `steps()` and `finish_summary()`), register it in `agents/runner.py`, then update the four roster locations listed above.
