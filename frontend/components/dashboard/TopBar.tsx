import type { RunState } from "@/lib/api/types";
import type { DashboardUser } from "./DashboardApp";

const STATE_LABEL: Record<RunState, string> = {
  queued: "QUEUED",
  planning: "PLANNING",
  awaiting_plan_approval: "AWAITING APPROVAL",
  running: "RUNNING",
  degraded: "DEGRADED",
  stopping: "STOPPING",
  stopped: "STOPPED",
  failed: "FAILED",
  completed: "COMPLETED",
};

const ACTIVE_STATES: RunState[] = ["queued", "planning", "awaiting_plan_approval", "running", "degraded"];

type Props = {
  user: DashboardUser;
  runState: RunState | null;
  connected: boolean;
  onStopRun: () => void;
  onResumeRun: () => void;
  onNewRun: () => void;
};

export function TopBar({ user, runState, connected, onStopRun, onResumeRun, onNewRun }: Props) {
  const canStop = runState !== null && ACTIVE_STATES.includes(runState);
  const canResume = runState === "stopped";

  return (
    <header className="border-line bg-topbar relative z-2 flex min-h-14 flex-none flex-wrap items-center gap-x-4 gap-y-2 border-b px-[18px] py-2 lg:flex-nowrap lg:py-0">
      <div className="text-[15px] font-extrabold tracking-[-.4px]">
        brain<span className="text-acid">X</span>
      </div>

      {runState && (
        <div className="bg-msg border-line-green flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px]">
          <span
            className="h-[7px] w-[7px] rounded-full"
            style={{ background: connected ? "#12f94b" : "#5f5f5f" }}
            aria-hidden="true"
          />
          <span className="font-bold">{STATE_LABEL[runState]}</span>
        </div>
      )}

      <div className="hidden flex-1 lg:block" />

      {canStop && (
        <button
          type="button"
          onClick={onStopRun}
          className="text-danger rounded-md border border-[#43201f] bg-transparent px-3 py-[7px] text-[10.5px] hover:border-danger"
        >
          ■ stop run
        </button>
      )}
      {canResume && (
        <button
          type="button"
          onClick={onResumeRun}
          className="bg-acid hover:bg-acid-hi rounded-md border-none px-3 py-[7px] text-[10.5px] font-bold text-[#0a0a0a] transition-colors"
        >
          ▶ resume run
        </button>
      )}
      {runState && (
        <button
          type="button"
          onClick={onNewRun}
          className="rounded-md border border-[#232323] bg-transparent px-3 py-[7px] text-[10.5px] text-[#8a8a8a] hover:border-[#3a3a3a]"
        >
          + new run
        </button>
      )}

      <div className="ml-auto flex items-center gap-[9px] text-[11px] text-[#b4b4b4] lg:ml-0">
        <div className="border-edge text-acid flex h-[27px] w-[27px] flex-none items-center justify-center rounded-full border bg-[#1c2b1c] text-[10px] font-bold">
          {user.initials}
        </div>
        <span className="hidden max-w-[180px] truncate sm:inline">
          {user.email}
        </span>
      </div>
    </header>
  );
}
