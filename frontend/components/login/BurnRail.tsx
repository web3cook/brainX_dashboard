import type { Frame } from "@/lib/demo-timeline";

type Props = Pick<Frame, "burn" | "spendRows">;

export function BurnRail({ burn, spendRows }: Props) {
  return (
    <div className="bg-rail border-line flex w-[212px] flex-none flex-col border-l">
      <div className="border-line text-acid border-b px-[14px] py-3 text-[9.5px] tracking-[.14em]">
        {"// LIVE BURN"}
      </div>

      <div className="flex flex-col gap-4 p-[14px]">
        <div className="flex h-[66px] items-end gap-[3px]">
          {burn.map((bar, i) => (
            <div
              key={i}
              className="bg-acid flex-1 rounded-[1px] transition-[height] duration-300 ease-linear"
              style={{ height: bar.height, opacity: bar.opacity }}
            />
          ))}
        </div>

        <div className="flex flex-col gap-[9px]">
          <div className="text-[9px] tracking-[.12em] text-[#6f7f6f]">
            SPEND BY AGENT
          </div>
          {spendRows.map((row) => (
            <div key={row.name} className="flex flex-col gap-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-[#c8c8c8]">{row.name}</span>
                <span className="text-acid">{row.amount}</span>
              </div>
              <div className="bg-track h-[3px] rounded-sm">
                <div
                  className="bg-acid-dim h-full rounded-sm transition-[width] duration-[400ms] ease-linear"
                  style={{ width: row.pct }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
