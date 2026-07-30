import type { AgentName } from "@/lib/dashboard/agents";
import type { DashboardState, Panel, Run } from "@/lib/dashboard/state";
import {
  TAB_DEFS,
  detailView,
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
  onDetailAction: (run: Run) => void;
  onToggleGuardrail: (index: number) => void;
  onToggleRosterAgent: (name: AgentName) => void;
  onSignOut: () => void;
};

export function RightPanel({
  state,
  detailRun,
  user,
  onSetPanel,
  onCloseDetail,
  onDetailAction,
  onToggleGuardrail,
  onToggleRosterAgent,
  onSignOut,
}: Props) {
  const isDetail = state.panel === "detail" && !!detailRun;
  const activeTab = state.panel === "detail" ? null : state.panel;

  return (
    <div className="border-line bg-rail flex min-h-0 w-[330px] flex-none border-l">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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

        <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto p-4">
          {isDetail && detailRun && (
            <RunDetailPanel
              detail={detailView(detailRun)}
              onAction={() => onDetailAction(detailRun)}
            />
          )}
          {state.panel === "analytics" && <AnalyticsPanel state={state} />}
          {state.panel === "runs" && <PastRunsPanel />}
          {state.panel === "settings" && (
            <SettingsPanel
              guardrails={state.guardrails}
              onToggle={onToggleGuardrail}
            />
          )}
          {state.panel === "profile" && (
            <ProfilePanel user={user} onSignOut={onSignOut} />
          )}
          {state.panel === "agents" && (
            <AgentRosterPanel
              roster={rosterView(state)}
              onToggle={onToggleRosterAgent}
            />
          )}
        </div>
      </div>

      <nav className="border-line bg-topbar flex w-[52px] flex-none flex-col items-center gap-2 border-l pt-[14px]">
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
