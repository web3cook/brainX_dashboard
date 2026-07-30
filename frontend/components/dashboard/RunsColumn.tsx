import type { RunCardView, StatView } from "@/lib/dashboard/view";
import { RunCard } from "./RunCard";

type Props = {
  stats: StatView[];
  runs: RunCardView[];
  liveCount: number;
  onSelectRun: (id: string) => void;
};

export function RunsColumn({ stats, runs, liveCount, onSelectRun }: Props) {
  return (
    <div className="flex min-w-0 flex-1 flex-col lg:min-h-0">
      <div className="bg-line border-line grid flex-none grid-cols-2 gap-px border-b sm:grid-cols-4">
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

      <div className="flex flex-1 flex-col gap-[14px] overflow-y-auto p-[18px] lg:min-h-0">
        <div className="flex flex-none items-center gap-3">
          <div className="text-acid text-[10px] tracking-[.14em]">
            {`// ACTIVE RUNS · ${liveCount}`}
          </div>
          <div className="bg-line h-px flex-1" />
          <div className="hidden text-[9.5px] text-[#6f6f6f] sm:block">
            click a card to stream it
          </div>
        </div>

        {runs.length === 0 ? (
          <div className="text-[11px] text-[#6f6f6f]">
            No agents spawned yet — approve the CMO&apos;s plan to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2">
            {runs.map((run) => (
              <RunCard key={run.id} run={run} onSelect={() => onSelectRun(run.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
