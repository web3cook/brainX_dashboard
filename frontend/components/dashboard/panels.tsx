import type { AgentName } from "@/lib/dashboard/agents";
import type { DashboardState, Guardrail } from "@/lib/dashboard/state";
import {
  HISTORY,
  OUTPUTS,
  PROFILE_ROWS,
  burnView,
  spendRowsView,
  type DetailView,
  type RosterRow,
} from "@/lib/dashboard/view";
import { Switch } from "./Switch";
import type { DashboardUser } from "./DashboardApp";

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[9.5px] tracking-[.12em] text-[#6f7f6f]">{children}</div>
);

/* ---------------------------------------------------------------- detail */

export function RunDetailPanel({
  detail,
  onAction,
}: {
  detail: DetailView;
  onAction: () => void;
}) {
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
            <span className="text-[9px] text-[#5f5f5f]">{c.time}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onAction}
          className="flex-1 rounded-md border py-2.5 text-[10.5px] font-bold"
          style={{
            color: detail.actionFg,
            background: detail.actionBg,
            borderColor: detail.actionBd,
          }}
        >
          {detail.actionLabel}
        </button>
        <button
          type="button"
          className="rounded-md border border-[#2a2a2a] bg-transparent px-[13px] py-2.5 text-[10.5px] text-[#b4b4b4] hover:border-[#3a3a3a]"
        >
          outputs
        </button>
      </div>

      <div className="border-line flex justify-between border-t pt-[14px] text-[10.5px] text-[#7f7f7f]">
        <span>{detail.tokens} tokens</span>
        <span className="text-acid">{detail.cost}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- analytics */

export function AnalyticsPanel({ state }: { state: DashboardState }) {
  const burn = burnView(state);
  const spendRows = spendRowsView(state);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="mb-2.5 text-[9.5px] tracking-[.12em] text-[#6f7f6f]">
          LIVE TOKEN BURN · 60 MIN
        </div>
        <div className="flex h-20 items-end gap-[3px]">
          {burn.map((b, i) => (
            <div
              key={i}
              className="bg-acid flex-1 rounded-[1px] transition-[height] duration-700 ease-linear"
              style={{ height: b.height, opacity: b.opacity }}
            />
          ))}
        </div>
        <div className="mt-[7px] flex justify-between text-[9px] text-[#5f5f5f]">
          <span>-60m</span>
          <span>now</span>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <SectionLabel>SPEND BY AGENT · TODAY</SectionLabel>
        {spendRows.map((s) => (
          <div key={s.name} className="flex flex-col gap-[5px]">
            <div className="flex justify-between text-[10.5px]">
              <span className="text-[#c8c8c8]">{s.name}</span>
              <span className="text-acid">{s.amount}</span>
            </div>
            <div className="bg-track h-[3px] rounded-sm">
              <div
                className="bg-acid-dim h-full rounded-sm transition-[width] duration-500 ease-linear"
                style={{ width: s.pct }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="border-line flex flex-col gap-[11px] border-t pt-4">
        <SectionLabel>OUTPUT THIS WEEK</SectionLabel>
        {OUTPUTS.map((o) => (
          <div
            key={o.label}
            className="flex justify-between text-[10.5px] text-[#9f9f9f]"
          >
            <span>{o.label}</span>
            <span className="text-ink font-bold">{o.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- past runs */

export function PastRunsPanel() {
  return (
    <div className="flex flex-col gap-[9px]">
      {HISTORY.map((h) => (
        <div
          key={`${h.name}-${h.task}`}
          className="bg-card flex flex-col gap-[7px] rounded-[7px] border border-[#171d17] px-3 py-[11px]"
        >
          <div className="flex items-center gap-2">
            <span className="text-acid w-4 flex-none text-[11px]">
              {h.glyph}
            </span>
            <span className="flex-1 text-[11.5px] font-bold">{h.name}</span>
            <span
              className="text-[9px] tracking-[.08em]"
              style={{ color: h.fg }}
            >
              {h.status}
            </span>
          </div>
          <div className="text-[10px] leading-[1.5] text-[#8a8a8a]">
            {h.task}
          </div>
          <div className="flex justify-between text-[9.5px] text-[#5f5f5f]">
            <span>{h.dur}</span>
            <span className="text-acid">{h.cost}</span>
          </div>
        </div>
      ))}
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
      <div className="flex flex-col gap-[9px]">
        <SectionLabel>DAILY SPEND CAP</SectionLabel>
        <div className="flex items-center gap-2.5">
          <div className="bg-track h-1 flex-1 rounded-sm">
            <div className="bg-acid h-full w-[17%] rounded-sm" />
          </div>
          <span className="text-[11px] font-bold">$25.00</span>
        </div>
        <div className="text-[9.5px] text-[#5f5f5f]">
          agents pause automatically at the cap
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <SectionLabel>GUARDRAILS</SectionLabel>
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

      <div className="border-line flex flex-col gap-[9px] border-t pt-4">
        <SectionLabel>BRAND VOICE</SectionLabel>
        <div className="text-[10.5px] leading-[1.7] text-[#9f9f9f]">
          Learned from 41 posts, your docs, and 3 competitor decks.{" "}
          <span className="text-acid">re-train ›</span>
        </div>
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
        <div className="text-[10.5px] text-[#9f9f9f]">
          Billing · <span className="text-acid">manage ›</span>
        </div>
        <div className="text-[10.5px] text-[#9f9f9f]">
          Team · <span className="text-acid">invite ›</span>
        </div>
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

export function AgentRosterPanel({
  roster,
  onToggle,
}: {
  roster: RosterRow[];
  onToggle: (name: AgentName) => void;
}) {
  return (
    <div className="flex flex-col gap-[9px]">
      {roster.map((a) => (
        <button
          key={a.name}
          type="button"
          onClick={() => onToggle(a.name)}
          className="bg-card flex cursor-pointer items-center gap-2.5 rounded-[7px] border px-[11px] py-2.5 text-left"
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
            <div
              className="text-[11.5px] font-bold"
              style={{ color: a.nameFg }}
            >
              {a.name}
            </div>
            <div className="truncate text-[9.5px] text-[#6f6f6f]">
              {a.state}
            </div>
          </div>
          <Switch on={a.on} />
        </button>
      ))}
    </div>
  );
}
