import type { AgentName } from "@/lib/dashboard/agents";
import type { RunCardView, StatView } from "@/lib/dashboard/view";
import { RunCard } from "./RunCard";

type Props = {
  stats: StatView[];
  runs: RunCardView[];
  liveCount: number;
  bench: { name: AgentName; glyph: string }[];
  onSelectRun: (id: number) => void;
  onRunAction: (id: number) => void;
  onHire: (name: AgentName) => void;
};

export function RunsColumn({
  stats,
  runs,
  liveCount,
  bench,
  onSelectRun,
  onRunAction,
  onHire,
}: Props) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="bg-line border-line grid flex-none grid-cols-4 gap-px border-b">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-panel flex flex-col gap-1.5 px-[18px] py-[15px]"
          >
            <div className="text-[9.5px] tracking-[.12em] text-[#6f7f6f]">
              {s.label}
            </div>
            <div
              className="text-[23px] font-extrabold tracking-[-.7px]"
              style={{ color: s.color }}
            >
              {s.value}
            </div>
            <div className="text-[10px] text-[#5f5f5f]">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto p-[18px]">
        <div className="flex flex-none items-center gap-3">
          <div className="text-acid text-[10px] tracking-[.14em]">
            {`// ACTIVE RUNS · ${liveCount}`}
          </div>
          <div className="bg-line h-px flex-1" />
          <div className="text-[9.5px] text-[#6f6f6f]">
            click a card to stream it
          </div>
        </div>

        <div className="grid grid-cols-2 gap-[14px]">
          {runs.map((run) => (
            <RunCard
              key={run.id}
              run={run}
              onSelect={() => onSelectRun(run.id)}
              onAction={() => onRunAction(run.id)}
            />
          ))}
        </div>

        <div className="mt-1 flex flex-none items-center gap-3">
          <div className="text-[10px] tracking-[.14em] text-[#6f7f6f]">
            {"// BENCH · NOT ACTIVATED"}
          </div>
          <div className="bg-line h-px flex-1" />
        </div>

        <div className="flex flex-wrap gap-[9px]">
          {bench.map((b) => (
            <button
              key={b.name}
              type="button"
              onClick={() => onHire(b.name)}
              className="flex items-center gap-2 rounded-lg border border-[#1f1f1f] bg-[#0b0d0b] px-3 py-[9px] text-[11px] text-[#8a8a8a] hover:border-[#2f5f3f] hover:text-[#c8c8c8]"
            >
              <span className="text-[#4f6f4f]" aria-hidden="true">
                {b.glyph}
              </span>
              {b.name}
              <span className="text-[#3f4f3f]" aria-hidden="true">
                +
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
