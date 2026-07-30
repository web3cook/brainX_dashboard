# MEMO: brainX

## The operator

**Maya, Growth Lead at a 20-person B2B SaaS company.** She knows marketing: channels, funnels, ICP, positioning, and she'll know instantly if a Reddit reply sounds like a bot. She does not know what a tool call, a token, or a subagent is, and must never be asked to learn. She's afraid of three things: the agent posting something embarrassing under the company's name, spending budget she didn't sign off on, and not knowing what it's been doing for the last six minutes. Every UI decision below serves that third fear specifically. Legibility over cleverness.

## What's real, what's stubbed, up front

The **CMO's planning call is real**: a live Claude Opus 5 request (prompt-cached system prompt, retry-once-then-template-fallback) turns a plain-language brief into a 3 to 7 phase plan across seven subagents. The **orchestration is real**: Postgres is an append-only event log, the actual system of record, with REST, WebSocket, reconnect, and audit all deriving from the same table. Phases run as real OS subprocesses (`python -m agents.runner`, one per invocation, visible in `ps aux`), capped at 3 concurrent, cancelled via a real `SIGINT` that the child catches, checkpoints to a real file for, and points Postgres at before exiting.

The **seven subagents are dummy**. Market Scout, SEO/GEO Analyst, Community Scout, X Scout, Linkedin Scout, Content Writer and Influencer each run a short canned step list and return fixture findings. No Reddit, LinkedIn, X, or SERP API is called anywhere. Disclosed, not hidden: the brief asks for a new domain and a lean engine, since the harness is what's graded.

**Token and cost figures are half real, half simulated, and the UI says which.** The CMO's planning call reports genuine usage from the Anthropic API (input, output, cache-read and cache-write tokens) priced at real Opus 5 rates, including the cost of a failed retry. The subagents make no LLM call at all, so they have no real usage; they emit *synthetic* per-step token counts so the harness has a live cost surface to render. Every such event is flagged `simulated: true`, the top bar tags the total `SIM`, and the analytics panel splits MEASURED from SIMULATED with the reason stated inline. A run's headline spend is therefore mostly fabricated. Treat only the MEASURED figure as real money.

**Free-form chat is not an LLM in the loop.** Only plan-proposal is a real call. A message gets a real, DB-computed answer if it matches "what's live / what's the plan / status" (I found mid-build that these were returning generic text regardless of the question, and fixed it to actually query live scope and phase state), or one of three rotating canned lines otherwise. Ask it something novel and it gives a plausible non-answer. Better to admit that than let a demo imply otherwise.

**Not built at all.** Per-action inline approval with edit and diff-preview (brief §3): the `approvals` table and grant/deny endpoints exist server-side but nothing in the frontend calls them, since dummy agents never propose a real write, spend, send or delete. Queued messages delivered at a phase boundary (§2): what exists instead is live chat with an immediate reply, which is a different feature. Mid-flight redirect on a phase that's actively running: redirect only applies via `resume`, folded into the resumed phase's brief. A deliverables panel (§5): artifacts (CSV and markdown) are generated, stored, and downloadable over REST, but nothing in the frontend renders them, so they're invisible without hitting the API directly. Fault injection: the dummy agents are deterministic and always succeed, so the only real, demoable failure path is the planner's retry/fallback or an actual infra fault.

## What I cut, and why

Built deep: §1 (legible runs) and §2 (interrupt, resume, autonomy). §3 only at the plan level. Cut entirely: per-action approval, queued messages, artifact delivery. Three days doesn't cover five deep systems, and faking a diff for a write the agent can't actually make would be exactly the "polished claim we can disprove" the brief warns against.

## The hardest rendering decision

The brief's centerpiece is a nested Phase→Task→Step tree that reads as coherent rather than interleaved. I designed it, then cut it. What shipped is a flat grid of run-cards (one per live agent invocation) plus a plan and phase list showing dependency order and status. I made that call because at this build's actual scale (7 phases, 3 concurrent, 4 to 7 steps per agent) a flat grid answers "what's happening right now" about as well as a tree would, for a fraction of the work, and the time bought went into making stop, resume and redirect *actually work correctly*. Three real orchestrator bugs surfaced and got fixed in that time, which a prettier tree on shakier plumbing would have hidden. I don't think this decision survives contact with a real 60-tool-call run whose subagents fire 20 calls each: at that depth a flat grid stops answering "how far through are we," and the tree stops being optional. It's the one tradeoff I'd redo with a fourth day.

## Every failure state

| Trigger | What the operator sees |
|---|---|
| Backend unreachable at load | Red banner: "Could not reach the backend." Nothing silently spins. |
| Planner call fails or returns a bad plan | Retried once; a fixed 3-phase template plan appears if that also fails. No visible error, a deliberate fail-open so an internal retry doesn't read as "broken." |
| Stale click (approve, stop or resume on a run that's moved on) | Silent no-op, because the run is already where the click wanted it. No error toast for a race that isn't a real failure. |
| An agent process exits abnormally | Its card turns red, labeled FAILED. The run still finishes with a mix of completed and failed phases. |
| Operator stops mid-flight | Every live agent gets `SIGINT`, checkpoints, and the run reaches STOPPED. Chat shows a real summary ("2 of 7 phases complete…") and a Resume button appears. |
| Operator resumes | The interrupted phase's *same* scope is re-spawned; the agent reads its checkpoint file and skips the steps it already finished, so work is not redone. Completed phases are untouched. Resume granularity is whole steps, matched by label, so a step interrupted mid-execution reruns from its start. A phase that died without checkpointing has nothing to resume from and restarts. |
| WebSocket drops | One session-scoped socket auto-reconnects and re-subscribes from the last applied seq, backfilling exactly what was missed. A chat message sent mid-gap is queued client-side and flushed on reopen instead of vanishing (a real bug found live and fixed this build). |
| Tab closed and reopened later | Next bootstrap finds the still-active run, reconnects, and replays full history. Nothing lost. |

## The one metric

**Operator override rate**: the percentage of proposed plans that get a phase deselected or rejected before approval, versus approved untouched. It's the one number that says whether the CMO's autonomy is trusted or fought at every plan. A product that looks "working" with a climbing override rate is quietly failing the actual bet.

## On taste

Near-black background, a faint green grid-line texture, one accent color (`#12f94b`) reused for anything currently alive, monospace figures, terminal-style labels (`// ACTIVE RUNS`). No gradient, no orb, no sparkle icon. Maya's stated fear is not knowing what's happening for six minutes, and a terminal or ops-console register says "you can see exactly what's running," where a softer assistant skin would undersell that real work is underway. The one place this brushes the brief's warning is the chat column, a vertical list of bordered message rows. I kept it because it's modeled on a Slack thread with a manager rather than a chatbot, and it stays monochrome instead of colorful to avoid tipping into that register.
