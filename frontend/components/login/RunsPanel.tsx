import type { Frame } from "@/lib/demo-timeline";
import { AgentCard } from "./AgentCard";

type Props = Pick<Frame, "stats" | "cards" | "beatHint">;

export function RunsPanel({ stats, cards, beatHint }: Props) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="bg-line border-line grid flex-none grid-cols-3 gap-px border-b">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-panel flex flex-col gap-[5px] px-[15px] py-3"
          >
            <div className="text-[9px] tracking-[.12em] text-[#6f7f6f]">
              {s.label}
            </div>
            <div
              className="text-[19px] font-extrabold tracking-[-.5px]"
              style={{ color: s.color }}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-[11px] p-[15px]">
        <div className="flex flex-none items-center gap-2.5">
          <div className="text-acid text-[9.5px] tracking-[.14em]">
            {"// ACTIVE RUNS"}
          </div>
          <div className="bg-line h-px flex-1" />
          <div className="text-[9px] text-[#6f6f6f]">{beatHint}</div>
        </div>

        <div className="grid grid-cols-2 gap-[11px]">
          {cards.map((card) => (
            <AgentCard key={card.name} card={card} />
          ))}
        </div>
      </div>
    </div>
  );
}
