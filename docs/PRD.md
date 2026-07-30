# PRD — brainX: an AI CMO you can watch, stop, and redirect

**Status:** v0.1, for POC scoping
**Assignment:** X-ARC Agentic AI Engineer take-home (Harness)
**Window:** 3 days

---

## 1. The one-sentence product

A browser workspace where a marketing operator briefs an AI CMO, watches it plan and execute deep multi-step growth work across research, SEO/GEO, Reddit, and social outreach, and can stop it at any moment to say "do it differently" without losing what it already learned.

---

## 2. Who the operator is

**Maya, Growth Lead at a 20-person B2B SaaS company.**

What she knows:

- Marketing. Channels, funnels, ICP, CAC, positioning, what a good LinkedIn post looks like.
- Her own product and its competitors, better than any agent will.
- How to judge output quality. She will know instantly if a Reddit reply sounds like a bot.

What she does not know, and must never be asked to learn:

- What a tool call is. What a token is. What a context window is.
- What a subagent is, by that name.
- What JSON is. What a stack trace means.
- Anything about the terminal.

What she is afraid of:

- The agent posting something embarrassing under the company's name.
- Spending budget she did not sign off on.
- Not knowing what the thing has been doing for the last six minutes.

**Design consequence:** every piece of UI copy is written for someone who manages people, not processes. The agent is a very fast junior team, not a program. Progress is expressed in work terms ("Analysing 4 competitor sites"), never in system terms ("tool_call: fetch_page").

---

## 3. The agent (deliberately the smaller half)

An **AI CMO** orchestrator that takes a growth brief and produces a strategy plus executed groundwork. It delegates to specialist subagents.

### Subagent roster

| Subagent | Owns | Namespace |
|---|---|---|
| Market Scout | Competitor and market research, positioning gaps | `research.*` |
| SEO/GEO Analyst | Keyword gaps, SERP position, LLM-citation coverage | `seo.*`, `geo.*` |
| Community Scout | Relevant subreddits and threads, reply opportunities | `reddit.*` |
| X Scout | People worth connecting with on X, generate posts and replies | `social.*` |
| Linkedin Scout | People worth connecting with on LinkedIn, generate posts and replies | `social.*` |
| Content Writer | Drafts SEO optimised articles | `content.*` |
| Influencer | Gets a list of influencers for the product and  | `influencer.*` |

Cross-cutting namespaces available to the CMO itself: `workspace.*` (read/write artifacts), `analytics.*` (channel metrics, budget model), `plan.*` (propose/revise the plan).

### Why this clears the brief's floor

A single "grow our inbound pipeline for Q3" brief naturally fires: ~6 research calls, ~5 SEO/GEO calls, ~6 Reddit calls, ~5 social calls, ~6 content calls, plus orchestrator-level planning and artifact writes. **Comfortably past 20 tool calls, across 7 namespaces, with 5 subagents.** No padding required.


---

## 4. Scope: what we build, what we cut

The brief says pick and go deep. Here is the call.

### Building deep

**P1 — Making a deep run legible** *(mandatory, carries the most weight)*

**P2 — Operator control** *(our differentiator)*

**P3 — Plan-level approval** *(scoped down, see below)*

### Cut, and why

| Cut | Why |
|---|---|
| Per-tool-call inline approvals | Replaced by **plan-level approval**, which is the honest shape of this product. A CMO does not approve each phone call a junior makes; she approves the campaign plan. Approving 60 individual actions is worse UX, not more control. |
| Tab-close survival / long-lived detached runs | Run state is persisted to Postgres from the start, so this is *architecturally free*, but we do not build reconnect-replay UI polish. Documented as a known gap. |
| Searchable session history | Runs are listed and openable; full-text search across past runs is cut|
| Retry-from-failed-step | Failures surface as a designed state with a resume affordance, but granular step-level retry is cut. Resume-from-checkpoint covers the same operator need. |
| Rich artifact delivery (P5) | Artifacts render as readable documents in a side panel with download. We do *not* build export integrations, doc editors, or diffing of artifacts. |
| Multi-user / teams / RBAC | Single operator. Auth exists (next-auth) but there is no sharing model. |

---

## 5. Requirements

### 5.1 Making a deep run legible (P1)

The core problem: an eight-minute run with 60+ nested calls must be answerable at a glance.

**R1.1 — Three-layer timeline.** The run renders as a hierarchy, not a log.

```
Phase          "Understanding the market"           ← always visible, ~5 per run
  └ Task       "Market Scout: competitor teardown"  ← collapsed by default when done
      └ Step   "Read pricing page — acme.com"       ← revealed on drill-in
```

- **Phases** are declared by the CMO in its plan up front. This is what makes progress estimable.
- **Tasks** are subagent invocations or significant orchestrator work units.
- **Steps** are individual tool calls, phrased in marketing language.

**R1.2 — The "right now" line.** A persistent header states, in one sentence, what is happening this second, plus phase N of M and elapsed time. This is the single most important pixel in the product. If the operator reads nothing else, they read this.

**R1.3 — Subagents render as coherent nested units, never interleaved.** A running subagent is one card that expands. Its internal steps live inside that card and stream within it. Two subagents running concurrently are two cards updating side by side, not two interleaved streams. **When the subagent finishes, the card collapses to a one-line finding** ("Market Scout: 4 competitors, all under-serving mid-market compliance") and its 20 steps go behind a disclosure.

**R1.4 — Progressive collapse.** Completed phases auto-collapse to a summary line. Only the active phase is expanded. The operator scrolls a page of findings, not a wall of logs.

**R1.5 — Drill-in without losing place.** Expanding any node is in-place and non-destructive. Raw detail (actual tool name, arguments, response) is available at the deepest level, behind an explicit "show technical detail" affordance — present for trust, absent by default.

**R1.6 — Findings are first-class.** Steps that produced a durable insight or artifact are visually distinct from steps that were plumbing. Noise recedes, substance stays.

### 5.2 Operator control (P2)

**R2.1 — Autonomy ladder.** Three modes, set at brief time and changeable mid-run:

| Mode | Operator-facing copy | Behaviour |
|---|---|---|
| **Draft only** | "Show me a plan and stop. I'll decide." | Agent plans, then halts for approval. Executes nothing. |
| **Plan, then run** *(default)* | "Plan it, get my OK, then go." | Agent plans, waits for approval, then executes to completion. |
| **Just run it** | "You have my trust. Go." | Agent plans and executes without pausing. Plan is still shown, live. |

No mention of permissions, sandboxes, or tools. The ladder is about *delegation trust*, which is a concept Maya already uses daily with humans.

**R2.2 — Plan approval.** Before executing, the CMO presents its plan as a readable phase list with rationale and expected outputs. The operator can:

- Approve as-is
- **Edit before approving** — reorder phases, delete a phase, or rewrite a phase's instruction in plain text
- Reject with a note, which sends the CMO back to re-plan

**R2.3 — Interrupt mid-flight.** A Stop control is always visible during a run. On stop:

1. In-flight tool calls are cancelled; subagents receive a cancellation signal and unwind.
2. The run writes a **checkpoint**: everything learned so far, structured and durable.
3. The CMO generates a **stop summary** — what it had done, what it had found, what it was about to do next, in plain language.
4. The run enters `stopped` and the UI asks a single question: **"What should we do differently?"**

**This is the product's signature moment.** Stopping is not an abort. It is a conversation.

**R2.4 — Redirect without discarding work.** From `stopped`, the operator types a redirect. The CMO re-plans *given the checkpoint*, showing explicitly what it will keep and what it will discard. Completed phases whose findings remain valid are not re-run. The operator approves the revised plan and execution continues.

**R2.5 — Queue a message.** While the run is executing, the operator can send a message without stopping. It is visibly queued ("Will be read at the end of this phase") and injected at the next phase boundary. The operator can cancel a queued message before it lands.

**R2.6 — Interrupt latency budget.** Stop must visibly acknowledge within 500ms and reach a fully checkpointed `stopped` state within 5 seconds. If a tool call cannot be cancelled quickly, the UI says so explicitly ("Finishing one last lookup, then stopping") rather than freezing.

### 5.3 Trust and consequential actions (P3, scoped)

**R3.1 — Consequence classes.** Every tool is tagged `read`, `write`, or `publish`. Only `publish` (posting to Reddit/LinkedIn/X, sending, spending) requires the operator's explicit sign-off, regardless of autonomy mode. This is the one thing "Just run it" does not cover, and the copy says so.

**R3.2 — Publish approval carries a preview.** The operator sees the exact final content, target, and time. Editable inline before approving.

**R3.3 — Non-blocking approvals.** A pending approval does **not** freeze the run. The run continues on independent work and the approval waits in a tray with a count badge. Only work genuinely downstream of the approval blocks, and it renders as "waiting on you" rather than "stalled". This is a deliberate answer to the brief's question about what happens to the run and to the watcher while an approval is pending.

**R3.4 — Read/write ledger.** Every run has a "What it touched" view: everything read, everything written, everything published, with timestamps. Available during and after the run.

### 5.4 Failure states

Each of these is a designed screen, not a stack trace:

| Failure | What Maya sees |
|---|---|
| A tool call fails | The step shows amber with a plain-language reason ("Couldn't reach that site"). The agent continues; the failure is recorded in the phase summary. |
| A tool fails repeatedly | The phase halts with "I'm stuck on X" and offers: skip this phase / retry / stop and redirect. |
| Model error or rate limit | Run pauses in a `degraded` state with "Thinking is temporarily unavailable — retrying in Ns". Auto-retry with backoff, visible countdown. |
| Run dies mid-flight | Run enters `failed` with the last checkpoint intact. UI: "This run stopped unexpectedly at phase 3 of 5. Everything up to that point is saved." Resume is offered. |
| Subagent fails | Parent card shows the subagent as failed with its partial findings preserved. Parent decides to continue or escalate. |

### 5.5 Deliverables from a run (thin P5)

Artifacts (strategy doc, keyword table, draft posts, outreach list) accumulate in a **Deliverables** panel during the run, not just at the end. Each renders as a formatted document — never a code block — and is downloadable as markdown or CSV.

---

## 6. Look and feel (the taste requirement)

**Rejected:** dark background, purple gradient, glowing orb, chat bubbles, sparkle icons.

**Chosen:** *a marketing war room, rendered as a working document.* Light, dense, typographic. The reference points are Linear's information density and a well-kept planning doc — not a chat app. Chrome is minimal because the content is the product. One accent colour used strictly for "needs you"; everything else is greyscale with state carried by typography and weight rather than colour. Monospace only where it is genuinely data (metrics, URLs, timestamps). The run reads top-to-bottom like a document being written in real time, because that is what it is, and because a document is a thing Maya already knows how to read and skim.

---

## 7. Acceptance criteria for the POC

The POC is done when, in a single unbroken demo:

1. A brief produces a plan; the operator edits one phase and approves it.
3. At any frozen frame of the run, a viewer can state what is happening now, what is done, and how far through it is — from the screen alone.
4. A completed subagent's 20 steps are collapsed behind a one-line finding, and expand in place.
5. The operator queues a message mid-run; it lands at the next phase boundary and visibly changes behaviour.
6. The operator stops the run mid-phase; a stop summary appears within 5 seconds; the operator types a redirect; the run resumes without re-running completed work.
7. A publish action is proposed, previewed, edited, and approved — while the rest of the run keeps moving.
8. A tool is deliberately broken; the operator sees a designed state and a way forward.
9. Deliverables are readable and downloadable.

---

## 8. Non-goals

Multi-tenant, teams, billing, real platform integrations, mobile, accessibility audit, model routing/cost optimisation, evals, prompt management UI.

---

## 9. Open questions

1. Should the autonomy ladder be settable per phase rather than per run? (Leaning no for the POC — extra concept for the operator to hold.)
2. Does the stop summary need to be LLM-generated, or is a structured template sufficient and faster? (Leaning LLM-generated: this is a showcase moment, and the quality gap is visible.)
3. How many concurrent subagents before the UI stops being legible? Needs a live test at 2, 3, and 5.
