"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import type { Plan } from "@/lib/api/types";
import { useRunSocket } from "@/lib/api/useRunSocket";
import {
  initialState,
  isTerminalRunState,
  reducer,
} from "@/lib/dashboard/state";
import type { Panel } from "@/lib/dashboard/state";
import { runCardView, statsView } from "@/lib/dashboard/view";
import { TopBar } from "./TopBar";
import { ChatColumn, type QuickAction } from "./ChatColumn";
import { RunsColumn } from "./RunsColumn";
import { RightPanel } from "./RightPanel";

export type DashboardUser = {
  name: string;
  email: string;
  initials: string;
};

const NON_TERMINAL_ORDER = ["running", "degraded", "awaiting_plan_approval", "planning", "queued"];

export function DashboardApp({
  user,
  onSignOut,
}: {
  user: DashboardUser;
  onSignOut: () => void;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [bootError, setBootError] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const { connected, events, sendChat } = useRunSocket(state.runId);
  const appliedCount = useRef(0);
  const thinkingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearThinkingTimeout = useCallback(() => {
    if (thinkingTimeout.current) {
      clearTimeout(thinkingTimeout.current);
      thinkingTimeout.current = null;
    }
  }, []);

  // Any chat send (typed or a quick action) shows "CMO is thinking" until a
  // real chat.reply event comes back over the socket. The 15s fallback just
  // guards against a spinner stuck forever if the reply never arrives.
  const sendMessage = useCallback(
    (text: string) => {
      sendChat(text);
      setThinking(true);
      clearThinkingTimeout();
      thinkingTimeout.current = setTimeout(() => setThinking(false), 15000);
    },
    [sendChat, clearThinkingTimeout],
  );

  useEffect(() => clearThinkingTimeout, [clearThinkingTimeout]);

  // First-visit REST bootstrap (docs/API.md `POST /bootstrap`): finds-or-
  // creates the user, then resumes whatever run is still in flight so a
  // refresh doesn't lose the thread. The WebSocket only opens once runId is
  // set, and its own backfill (since=0) is what actually repopulates plan,
  // run cards, and chat — bootstrap itself only decides *which* run to open.
  useEffect(() => {
    appliedCount.current = 0;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.bootstrap(user.email, user.name);
        if (cancelled) return;
        dispatch({ type: "setPastRuns", runs: res.runs });
        const active = res.runs.find((r) => NON_TERMINAL_ORDER.includes(r.state));
         
        console.info(
          `[dashboard] bootstrap: ${res.runs.length} run(s), resuming ${active ? `${active.id} (${active.state})` : "none — showing composer"}`,
        );
        if (active) {
          dispatch({ type: "initRun", runId: active.id, runState: active.state, plan: null });
        }
      } catch (err) {
        if (!cancelled) {
          setBootError(err instanceof ApiError ? err.detail : "Could not reach the backend.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fold every new backfilled/live event into state exactly once each.
  useEffect(() => {
    for (; appliedCount.current < events.length; appliedCount.current++) {
      const event = events[appliedCount.current];
      dispatch({ type: "applyEvent", event });
      if (event.type === "chat.reply") {
        setThinking(false);
        clearThinkingTimeout();
      }
    }
  }, [events, clearThinkingTimeout]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.panel === "detail") dispatch({ type: "closeDetail" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.panel]);

  const send = useCallback(async () => {
    const text = state.input.trim();
    if (!text || thinking) return;
    dispatch({ type: "clearInput" });

    if (!state.runId) {
      const title = text.length > 60 ? `${text.slice(0, 57)}...` : text;
      setThinking(true);
       
      console.info(`[dashboard] creating run: title=${JSON.stringify(title)} autonomy=${state.autonomyMode}`);
      try {
        const res = await api.createRun(user.email, {
          title,
          brief: text,
          autonomy_mode: state.autonomyMode,
        });
         
        console.info(`[dashboard] run created: ${res.run.id} state=${res.run.state}`);
        dispatch({ type: "initRun", runId: res.run.id, runState: res.run.state, plan: null });
        // pastRuns is only fetched once at bootstrap — without this, a run
        // started mid-session wouldn't show up under "past runs" to click
        // back into until the next full reload.
        dispatch({
          type: "addPastRun",
          run: { id: res.run.id, title: res.run.title, state: res.run.state, created_at: res.run.created_at },
        });
      } catch (err) {
        dispatch({
          type: "say",
          who: "SYSTEM · now",
          text: err instanceof ApiError ? `Couldn't start that run: ${err.detail}` : "Couldn't reach the backend.",
        });
      } finally {
        setThinking(false);
      }
      return;
    }

    sendMessage(text);
  }, [state.input, state.runId, state.autonomyMode, thinking, user.email, sendMessage]);

  const approvingRef = useRef(false);
  const confirmChatAction = useCallback(
    (index: number) => {
      dispatch({ type: "dismissAction", index });
      if (!state.runId || !state.plan || !state.planSelection || state.planSelection.size === 0) return;
      if (approvingRef.current) {
        console.warn(`[dashboard] approve-plan click ignored — already in flight for run=${state.runId}`);
        return;
      }
      approvingRef.current = true;

      // Only send edited_plan when the operator actually deselected
      // something — sending it unconditionally would fire a redundant
      // plan.edited event server-side even when nothing changed.
      const allSelected = state.planSelection.size === state.plan.phases.length;
      const editedPlan: Plan | undefined = allSelected
        ? undefined
        : { phases: state.plan.phases.filter((p) => state.planSelection!.has(p.id)) };

      console.info(
        `[dashboard] approving plan for run=${state.runId}` +
          (editedPlan ? ` — ${editedPlan.phases.length}/${state.plan.phases.length} phases selected` : " — full plan"),
      );
      api
        .approvePlan(state.runId, editedPlan)
        .catch((err) => {
          // A 409 here means the plan already moved past awaiting-approval —
          // e.g. a second click landed after the first one succeeded, or
          // `just_run` autonomy auto-approved it already. Nothing is actually
          // wrong, so don't scare the operator with an error for it.
          if (err instanceof ApiError && err.status === 409) return;
          dispatch({ type: "say", who: "SYSTEM · now", text: "Couldn't approve the plan — try again." });
        })
        .finally(() => {
          approvingRef.current = false;
        });
    },
    [state.runId, state.plan, state.planSelection],
  );

  const stopRun = useCallback(() => {
    if (!state.runId) return;
     
    console.info(`[dashboard] stopping run=${state.runId}`);
    api.stopRun(state.runId).catch((err) => {
      // A 409 means it already isn't "running" (e.g. a second click landed
      // after the first stop already took effect) — not a real failure.
      if (err instanceof ApiError && err.status === 409) return;
      dispatch({ type: "say", who: "SYSTEM · now", text: "Couldn't stop the run — try again." });
    });
  }, [state.runId]);

  const resumeRun = useCallback(() => {
    if (!state.runId) return;
     
    console.info(`[dashboard] resuming run=${state.runId}`);
    api.resumeRun(state.runId).catch((err) => {
      if (err instanceof ApiError && err.status === 409) return;
      dispatch({ type: "say", who: "SYSTEM · now", text: "Couldn't resume the run — try again." });
    });
  }, [state.runId]);

  const openPastRun = useCallback(
    (id: string) => {
      if (id === state.runId) return;
      const summary = state.pastRuns.find((r) => r.id === id);
      if (!summary) return;
      console.info(`[dashboard] opening past run: ${id} (${summary.state})`);
      dispatch({ type: "initRun", runId: summary.id, runState: summary.state, plan: null });
    },
    [state.runId, state.pastRuns],
  );

  const newRun = useCallback(() => {
    if (state.runId && !isTerminalRunState(state.runState)) {
      api.stopRun(state.runId).catch(() => {});
    }
    dispatch({ type: "resetRun" });
    setThinking(false);
    clearThinkingTimeout();
  }, [state.runId, state.runState, clearThinkingTimeout]);

  const detailRun = state.selected ? state.runs[state.selected] : undefined;
  const liveRuns = useMemo(
    () => Object.values(state.runs).filter((r) => r.status === "running"),
    [state.runs],
  );

  const runCards = useMemo(
    () => Object.values(state.runs).map(runCardView),
    [state.runs],
  );
  const stats = useMemo(() => statsView(state), [state]);

  const quick: QuickAction[] = [
    { label: "what's live?", onClick: () => sendMessage("what's live right now?") },
    { label: "what's the plan?", onClick: () => sendMessage("what's the plan?") },
    { label: "status update", onClick: () => sendMessage("give me a status update") },
  ];

  return (
    // Below `lg` the app is a normal scrolling page with stacked sections;
    // at `lg` and up it becomes a fixed-viewport shell where each column
    // scrolls internally, like a desktop app.
    <div className="bg-stage relative flex min-h-screen w-full flex-col lg:h-screen lg:overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(18,249,75,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(18,249,75,.025) 1px,transparent 1px)",
          backgroundSize: "38px 38px",
        }}
      />

      <TopBar
        user={user}
        runState={state.runState}
        connected={connected}
        onStopRun={stopRun}
        onResumeRun={resumeRun}
        onNewRun={newRun}
      />

      {bootError && (
        <div className="border-danger relative z-2 border-b bg-[#2a1414] px-[18px] py-2 text-[11px] text-[#ff8f8a]">
          {bootError}
        </div>
      )}

      <div className="relative z-1 flex flex-1 flex-col lg:min-h-0 lg:flex-row">
        <ChatColumn
          chat={state.chat}
          thinking={thinking}
          input={state.input}
          quick={quick}
          placeholder={state.runId ? "tell the CMO what to do…" : "describe what you want the CMO to work on…"}
          showAutonomyPicker={!state.runId}
          autonomyMode={state.autonomyMode}
          plan={state.plan}
          planSelection={state.planSelection}
          onSetAutonomyMode={(mode) => dispatch({ type: "setAutonomyMode", mode })}
          onTogglePhase={(phaseId) => dispatch({ type: "togglePhase", phaseId })}
          onInput={(value) => dispatch({ type: "setInput", value })}
          onSend={send}
          onConfirmAction={confirmChatAction}
          onDismissAction={(index) => dispatch({ type: "dismissAction", index })}
        />

        <RunsColumn
          stats={stats}
          runs={runCards}
          liveCount={liveRuns.length}
          onSelectRun={(id) => dispatch({ type: "selectRun", id })}
        />

        <RightPanel
          state={state}
          detailRun={detailRun}
          user={user}
          onSetPanel={(panel: Exclude<Panel, "detail">) => dispatch({ type: "setPanel", panel })}
          onCloseDetail={() => dispatch({ type: "closeDetail" })}
          onToggleGuardrail={(index) => dispatch({ type: "toggleGuardrail", index })}
          onSignOut={onSignOut}
          onOpenPastRun={openPastRun}
        />
      </div>
    </div>
  );
}
