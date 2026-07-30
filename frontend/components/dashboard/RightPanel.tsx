import type { DashboardState, Panel, Run } from "@/lib/dashboard/state";
import {
  TAB_DEFS,
  detailView,
  historyView,
  panelTitle,
  rosterView,
} from "@/lib/dashboard/view";
import {
  AgentRosterPanel,
  AnalyticsPanel,
  PastRunsPanel,
  ProfilePanel,
  RunDetailPanel,
  SettingsPanel,
} from "./panels";
import type { DashboardUser } from "./DashboardApp";

type Props = {
  state: DashboardState;
  detailRun: Run | undefined;
  user: DashboardUser;
  onSetPanel: (panel: Exclude<Panel, "detail">) => void;
  onCloseDetail: () => void;
  onToggleGuardrail: (index: number) => void;
  onSignOut: () => void;
  onOpenPastRun: (id: string) => void;
};

export function RightPanel({
  state,
  detailRun,
  user,
  onSetPanel,
  onCloseDetail,
  onToggleGuardrail,
  onSignOut,
  onOpenPastRun,
}: Props) {
  const isDetail = state.panel === "detail" && !!detailRun;
  const activeTab = state.panel === "detail" ? null : state.panel;

  return (
    // `flex-col-reverse` puts the tab rail (last in DOM) visually above the
    // content on mobile without changing DOM/tab order; `lg:flex-row`
    // restores the desktop layout of content-left, rail-right.
    <div className="border-line bg-rail flex w-full flex-none flex-col-reverse border-t lg:h-full lg:w-[330px] lg:min-h-0 lg:flex-row lg:border-l lg:border-t-0">
      <div className="flex min-w-0 flex-1 flex-col lg:min-h-0">
        <div className="border-line flex flex-none items-center gap-2.5 border-b px-4 py-[14px]">
          <div className="text-acid text-[10px] tracking-[.14em]">
            {`// ${panelTitle(state, detailRun)}`}
          </div>
          <div className="flex-1" />
          {state.panel === "detail" && (
            <button
              type="button"
              onClick={onCloseDetail}
              className="rounded border border-[#232323] bg-transparent px-[7px] py-[3px] text-[9.5px] text-[#8a8a8a] hover:border-[#3a3a3a]"
            >
              esc
            </button>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-[18px] overflow-y-auto p-4 lg:min-h-0">
          {isDetail && detailRun && <RunDetailPanel detail={detailView(detailRun)} />}
          {state.panel === "analytics" && <AnalyticsPanel state={state} />}
          {state.panel === "runs" && (
            <PastRunsPanel
              rows={historyView(state.pastRuns)}
              currentRunId={state.runId}
              onSelect={onOpenPastRun}
            />
          )}
          {state.panel === "settings" && (
            <SettingsPanel
              guardrails={state.guardrails}
              onToggle={onToggleGuardrail}
            />
          )}
          {state.panel === "profile" && (
            <ProfilePanel user={user} onSignOut={onSignOut} />
          )}
          {state.panel === "agents" && <AgentRosterPanel roster={rosterView(state)} />}
        </div>
      </div>

      <nav className="border-line bg-topbar flex w-full flex-none flex-row items-center justify-center gap-2 border-t py-2 lg:h-full lg:w-[52px] lg:flex-col lg:border-l lg:border-t-0 lg:py-0 lg:pt-[14px]">
        {TAB_DEFS.map((t) => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onSetPanel(t.key)}
              title={t.label}
              aria-label={t.label}
              aria-current={active}
              className="flex h-[34px] w-[34px] items-center justify-center rounded-[7px] border text-[13px]"
              style={{
                background: active ? "#0f1f12" : "transparent",
                borderColor: active ? "#2f5f3f" : "transparent",
                color: active ? "#12f94b" : "#6f6f6f",
              }}
            >
              {t.glyph}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
