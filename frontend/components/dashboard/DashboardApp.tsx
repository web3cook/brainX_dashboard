"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { AgentName } from "@/lib/dashboard/agents";
import {
  STAGE_HEIGHT,
  STAGE_WIDTH,
  TICK_MS,
  fmtNum,
  initialState,
  reducer,
  type ChatAction,
  type Panel,
  type Run,
} from "@/lib/dashboard/state";
import {
  benchView,
  pickerView,
  runCardView,
  statsView,
} from "@/lib/dashboard/view";
import { TopBar } from "./TopBar";
import { ChatColumn, type QuickAction } from "./ChatColumn";
import { RunsColumn } from "./RunsColumn";
import { RightPanel } from "./RightPanel";
import { AgentPicker } from "./AgentPicker";

export type DashboardUser = {
  name: string;
  email: string;
  initials: string;
};

/** Delay before a CMO reply lands, matching the design's thinking beat. */
const CMO_REPLY_MS = 900;

export function DashboardApp({
  user,
  onSignOut,
}: {
  user: DashboardUser;
  onSignOut: () => void;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [scale, setScale] = useState(1);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Scale the fixed 1440x900 stage down to fit, never up.
  useEffect(() => {
    const fit = () =>
      setScale(
        Math.min(
          1,
          window.innerWidth / STAGE_WIDTH,
          window.innerHeight / STAGE_HEIGHT,
        ),
      );
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    const id = setInterval(() => dispatch({ type: "tick" }), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Any pending CMO replies must not fire after unmount.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const cmoSay = useCallback((text: string, action?: ChatAction | null) => {
    dispatch({ type: "thinking", value: true });
    const id = setTimeout(() => {
      timers.current.delete(id);
      dispatch({ type: "thinking", value: false });
      dispatch({ type: "say", who: "CMO · now", text, action });
    }, CMO_REPLY_MS);
    timers.current.add(id);
  }, []);

  const you = useCallback(
    (text: string) => dispatch({ type: "say", who: "YOU · now", text }),
    [],
  );

  const stopRun = useCallback(
    (id: number) => {
      const run = state.runs.find((r) => r.id === id);
      dispatch({ type: "stop", id });
      if (run) {
        cmoSay(
          `Stopped the ${run.name} agent and saved a checkpoint. Want a full report or a resume?`,
        );
      }
    },
    [state.runs, cmoSay],
  );

  const resumeRun = useCallback(
    (id: number) => {
      const run = state.runs.find((r) => r.id === id);
      dispatch({ type: "resume", id });
      if (run) {
        cmoSay(
          `${run.name} agent resumed from its last checkpoint. I'll hold every output for your approval.`,
        );
      }
    },
    [state.runs, cmoSay],
  );

  const stopAll = useCallback(() => {
    dispatch({ type: "stopAll" });
    cmoSay(
      "All running agents halted with checkpoints saved. Burn rate is now zero.",
    );
  }, [cmoSay]);

  const addAgent = useCallback(
    (name: AgentName) => {
      if (state.runs.some((r) => r.name === name)) return;
      dispatch({ type: "addAgent", name });
      cmoSay(
        `${name} agent activated. Give me a brief or I'll infer one from your changelog.`,
      );
    },
    [state.runs, cmoSay],
  );

  /** Card and detail buttons share one status-driven action. */
  const runAction = useCallback(
    (run: Run) => {
      if (run.status === "running") stopRun(run.id);
      else if (run.status === "waiting") dispatch({ type: "approve", id: run.id });
      else resumeRun(run.id);
    },
    [stopRun, resumeRun],
  );

  const send = useCallback(() => {
    const text = state.input.trim();
    if (!text) return;
    you(text);
    dispatch({ type: "clearInput" });
    cmoSay(
      "On it. I'll brief the right agents and hold anything publishable for your approval.",
    );
  }, [state.input, you, cmoSay]);

  const deploy = useCallback(() => {
    Object.keys(state.pick)
      .filter((name) => state.pick[name])
      .forEach((name) => addAgent(name as AgentName));
    dispatch({ type: "closePicker" });
    dispatch({ type: "resetPick" });
  }, [state.pick, addAgent]);

  // Escape closes the picker first, then a run detail.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (state.pickerOpen) dispatch({ type: "closePicker" });
      else if (state.panel === "detail") dispatch({ type: "closeDetail" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.pickerOpen, state.panel]);

  const detailRun = state.runs.find((r) => r.id === state.selected);
  const liveRuns = state.runs.filter((r) => r.status === "running");
  const stoppedCount = state.runs.filter((r) => r.status === "stopped").length;

  const runCards = useMemo(() => state.runs.map(runCardView), [state.runs]);
  const stats = useMemo(() => statsView(state), [state]);
  const bench = useMemo(() => benchView(state), [state]);
  const picker = useMemo(() => pickerView(state), [state]);

  const quick: QuickAction[] = [
    {
      label: "what's live?",
      onClick: () => {
        you("what's live?");
        cmoSay(
          `${liveRuns.length} agents running, ${stoppedCount} stopped with checkpoints. Burn is ${fmtNum(state.rate)} tok/min.`,
        );
      },
    },
    { label: "stop all", onClick: stopAll },
    {
      label: "raise cap to $50",
      onClick: () => {
        you("raise cap to $50");
        cmoSay("Daily cap raised to $50.00. I'll warn you at 80%.");
      },
    },
    {
      label: "summarize today",
      onClick: () => {
        you("summarize today");
        cmoSay(
          `17 drafts, 9 threads seeded, 12 docs pages optimized. $${state.spend.toFixed(2)} spent. 3 items need your approval.`,
        );
      },
    },
  ];

  const confirmChatAction = (index: number) => {
    const action = state.chat[index]?.action;
    if (!action) return;
    const run = state.runs.find((r) => r.name === action.agent);
    if (run) resumeRun(run.id);
  };

  const toggleRosterAgent = (name: AgentName) => {
    const run = state.runs.find((r) => r.name === name);
    if (!run) addAgent(name);
    else if (run.status === "running") stopRun(run.id);
    else resumeRun(run.id);
  };

  return (
    <div className="bg-shell flex h-screen w-full items-center justify-center overflow-hidden">
      <div
        className="bg-stage relative flex flex-none flex-col rounded-sm"
        style={{
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          transform: `scale(${scale})`,
        }}
      >
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
          rate={state.rate}
          spend={state.spend}
          onStopAll={stopAll}
          onOpenPicker={() => dispatch({ type: "openPicker" })}
        />

        <div className="relative z-1 flex min-h-0 flex-1">
          <ChatColumn
            chat={state.chat}
            thinking={state.thinking}
            input={state.input}
            quick={quick}
            onInput={(value) => dispatch({ type: "setInput", value })}
            onSend={send}
            onConfirmAction={confirmChatAction}
            onDismissAction={(index) =>
              dispatch({ type: "dismissAction", index })
            }
          />

          <RunsColumn
            stats={stats}
            runs={runCards}
            liveCount={liveRuns.length}
            bench={bench}
            onSelectRun={(id) => dispatch({ type: "selectRun", id })}
            onRunAction={(id) => {
              const run = state.runs.find((r) => r.id === id);
              if (run) runAction(run);
            }}
            onHire={addAgent}
          />

          <RightPanel
            state={state}
            detailRun={detailRun}
            user={user}
            onSetPanel={(panel: Exclude<Panel, "detail">) =>
              dispatch({ type: "setPanel", panel })
            }
            onCloseDetail={() => dispatch({ type: "closeDetail" })}
            onDetailAction={runAction}
            onToggleGuardrail={(index) =>
              dispatch({ type: "toggleGuardrail", index })
            }
            onToggleRosterAgent={toggleRosterAgent}
            onSignOut={onSignOut}
          />
        </div>

        {state.pickerOpen && (
          <AgentPicker
            rows={picker}
            selectedCount={Object.values(state.pick).filter(Boolean).length}
            onToggle={(name) => dispatch({ type: "togglePick", name })}
            onCancel={() => dispatch({ type: "closePicker" })}
            onDeploy={deploy}
          />
        )}
      </div>
    </div>
  );
}
