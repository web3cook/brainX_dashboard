import type { DashboardState, Guardrail } from "@/lib/dashboard/state";
import {
  PROFILE_ROWS,
  type DetailView,
  type HistoryRow,
  type RosterRow,
} from "@/lib/dashboard/view";
import { Switch } from "./Switch";
import type { DashboardUser } from "./DashboardApp";

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[9.5px] tracking-[.12em] text-[#6f7f6f]">{children}</div>
);

const PHASE_FG: Record<string, string> = {
  pending: "#6f6f6f",
  running: "#ffb545",
  completed: "#12f94b",
  skipped: "#6f6f6f",
  failed: "#ff5f56",
};

/* ---------------------------------------------------------------- detail */

export function RunDetailPanel({ detail }: { detail: DetailView }) {
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex items-center gap-2.5">
        <div className="bg-glyph border-edge text-acid flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[7px] border text-[13px]">
          {detail.glyph}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-extrabold">{detail.name} agent</div>
          <div className="truncate text-[9.5px] text-[#6f6f6f]">
            {detail.task}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>{detail.streamTitle}</SectionLabel>
        <div className="bg-panel max-h-[210px] overflow-y-auto rounded-[7px] border border-[#171d17] px-3 py-[11px] text-[10.5px] leading-[1.8] text-[#9f9f9f]">
          {detail.lines.map((line, i) => (
            <div key={`${line}-${i}`}>
              <span className="text-edge">›</span> {line}
            </div>
          ))}
          {detail.live && (
            <div className="text-acid">
              › working<span className="animate-[blink_1s_infinite]">▊</span>
            </div>
          )}
        </div>
      </div>

      {detail.summary && (
        <div className="flex flex-col gap-2">
          <div className="text-acid text-[9.5px] tracking-[.12em]">
            RUN SUMMARY
          </div>
          <div className="border-l-edge border-l-2 pl-3 text-[11.5px] leading-[1.7] text-[#c8c8c8]">
            {detail.summary}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-[7px]">
        <SectionLabel>CHECKPOINTS</SectionLabel>
        {detail.checkpoints.map((c) => (
          <div
            key={c.label}
            className="bg-card flex items-center gap-[9px] rounded-md border px-[9px] py-[7px] text-[10.5px]"
            style={{ color: c.fg, borderColor: c.bd }}
          >
            <span style={{ color: c.markFg }} aria-hidden="true">
              {c.mark}
            </span>
            <span className="flex-1">{c.label}</span>
          </div>
        ))}
      </div>

      <div className="border-line flex justify-between border-t pt-[14px] text-[10.5px] text-[#7f7f7f]">
        <span>{detail.steps}</span>
        <span className="text-acid">use “+ new run” / topbar stop to control this run</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- analytics */

export function AnalyticsPanel({ state }: { state: DashboardState }) {
  const phases = state.plan?.phases ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <SectionLabel>RUN</SectionLabel>
        <div className="flex justify-between text-[11px] text-[#c8c8c8]">
          <span>state</span>
          <span className="text-acid font-bold">{state.runState ?? "—"}</span>
        </div>
        <div className="flex justify-between text-[11px] text-[#c8c8c8]">
          <span>autonomy</span>
          <span className="font-bold">{state.autonomyMode.replace(/_/g, " ")}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <SectionLabel>PLAN</SectionLabel>
        {phases.length === 0 && (
          <div className="text-[10.5px] text-[#6f6f6f]">
            No plan yet — send the CMO a brief to get one.
          </div>
        )}
        {phases.map((p, i) => (
          <div
            key={p.id}
            className="bg-card flex flex-col gap-1 rounded-md border border-[#171d17] px-3 py-2"
          >
            <div className="flex justify-between gap-2 text-[10.5px]">
              <span className="text-[#c8c8c8]">
                {i + 1}. {p.title}
              </span>
              <span style={{ color: PHASE_FG[p.status] ?? "#6f6f6f" }}>
                {p.status}
              </span>
            </div>
            <div className="text-[9.5px] text-[#6f6f6f]">
              {p.assigned_agent.replace(/_/g, " ")} · ~{p.est_steps} steps
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- past runs */

export function PastRunsPanel({
  rows,
  currentRunId,
  onSelect,
}: {
  rows: HistoryRow[];
  currentRunId: string | null;
  onSelect: (id: string) => void;
}) {
  if (rows.length === 0) {
    return <div className="text-[11px] text-[#6f6f6f]">No past runs yet.</div>;
  }
  return (
    <div className="flex flex-col gap-[9px]">
      {rows.map((h) => {
        const active = h.id === currentRunId;
        return (
          <button
            key={h.id}
            type="button"
            onClick={() => onSelect(h.id)}
            aria-current={active}
            className="bg-card flex cursor-pointer flex-col gap-[7px] rounded-[7px] border px-3 py-[11px] text-left hover:border-[#2f5f3f]"
            style={{ borderColor: active ? "#2f5f3f" : "#171d17" }}
          >
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate text-[11.5px] font-bold">{h.title}</span>
              <span className="text-[9px] tracking-[.08em]" style={{ color: h.fg }}>
                {h.state}
              </span>
            </div>
            <div className="flex justify-between text-[9.5px] text-[#5f5f5f]">
              <span>{h.createdAt}</span>
              {active && <span className="text-acid">currently open</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------- settings */

export function SettingsPanel({
  guardrails,
  onToggle,
}: {
  guardrails: Guardrail[];
  onToggle: (index: number) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2.5">
        <SectionLabel>GUARDRAILS</SectionLabel>
        <div className="text-[9.5px] leading-[1.5] text-[#5f5f5f]">
          Cosmetic in this build — not enforced by the backend yet.
        </div>
        {guardrails.map((t, i) => (
          <button
            key={t.label}
            type="button"
            role="switch"
            aria-checked={t.on}
            onClick={() => onToggle(i)}
            className="bg-card flex cursor-pointer items-center gap-2.5 rounded-[7px] border px-[11px] py-[9px] text-left"
            style={{ borderColor: t.on ? "#1f2b1f" : "#171717" }}
          >
            <span className="flex-1 text-[10.5px] text-[#c8c8c8]">
              {t.label}
            </span>
            <Switch on={t.on} />
          </button>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- profile */

export function ProfilePanel({
  user,
  onSignOut,
}: {
  user: DashboardUser;
  onSignOut: () => void;
}) {
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex items-center gap-3">
        <div className="border-edge text-acid flex h-11 w-11 flex-none items-center justify-center rounded-full border bg-[#1c2b1c] text-[14px] font-extrabold">
          {user.initials}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[12.5px] font-bold">{user.name}</div>
          <div className="truncate text-[10px] text-[#6f6f6f]">
            {user.email} · Google
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <SectionLabel>WORKSPACE</SectionLabel>
        {PROFILE_ROWS.map((p) => (
          <div
            key={p.label}
            className="flex justify-between text-[10.5px] text-[#9f9f9f]"
          >
            <span>{p.label}</span>
            <span className="text-ink">{p.value}</span>
          </div>
        ))}
      </div>

      <div className="border-line flex flex-col items-start gap-[9px] border-t pt-4">
        <button
          type="button"
          onClick={onSignOut}
          className="border-none bg-transparent p-0 text-[10.5px] text-[#8a8a8a] hover:text-[#c8c8c8]"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- roster */

export function AgentRosterPanel({ roster }: { roster: RosterRow[] }) {
  return (
    <div className="flex flex-col gap-[9px]">
      {roster.map((a) => (
        <div
          key={a.name}
          className="bg-card flex items-center gap-2.5 rounded-[7px] border px-[11px] py-2.5"
          style={{ borderColor: a.borderColor }}
        >
          <div
            className="bg-glyph flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[5px] border text-[11px]"
            style={{ borderColor: a.borderColor, color: a.glyphFg }}
            aria-hidden="true"
          >
            {a.glyph}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11.5px] font-bold" style={{ color: a.nameFg }}>
              {a.label}
            </div>
            <div className="truncate text-[9.5px] text-[#6f6f6f]">{a.state}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
