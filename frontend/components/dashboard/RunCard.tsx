import type { RunCardView } from "@/lib/dashboard/view";

type Props = {
  run: RunCardView;
  onSelect: () => void;
  onAction: () => void;
};

export function RunCard({ run, onSelect, onAction }: Props) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-label={`${run.name} run — ${run.statusLabel}`}
      className="bg-card focus-visible:outline-acid flex cursor-pointer flex-col gap-[11px] rounded-[10px] border p-[14px] focus-visible:outline-2"
      style={{ borderColor: run.borderColor }}
    >
      <div className="flex items-center gap-[9px]">
        <div
          className="bg-glyph flex h-[27px] w-[27px] flex-none items-center justify-center rounded-md border text-[12px]"
          style={{ borderColor: run.borderColor, color: run.glyphFg }}
          aria-hidden="true"
        >
          {run.glyph}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="text-[12.5px] font-bold"
            style={{ color: run.nameFg }}
          >
            {run.name}
          </div>
          <div className="truncate text-[9.5px] text-[#6f6f6f]">{run.task}</div>
        </div>
        <div
          className="flex-none rounded px-[7px] py-[3px] text-[9px] tracking-[.1em]"
          style={{ background: run.badgeBg, color: run.badgeFg }}
        >
          {run.statusLabel}
        </div>
      </div>

      <div className="h-px bg-[#1a1f1a]" />

      <div className="flex min-h-[80px] flex-col gap-1.5 text-[10.5px] leading-[1.5] text-[#9f9f9f]">
        {run.lines.map((line, i) => (
          <div key={`${line}-${i}`} className="truncate">
            <span className="text-edge">›</span> {line}
          </div>
        ))}
        {run.summary && (
          <div
            className="overflow-hidden text-[10.5px] leading-[1.55] text-[#c8c8c8]"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 4,
              WebkitBoxOrient: "vertical",
            }}
          >
            {run.summary}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        <div className="bg-track h-1 flex-1 overflow-hidden rounded-sm">
          <div
            className="h-full transition-[width] duration-500 ease-linear"
            style={{ width: run.pct, background: run.barFg }}
          />
        </div>
        <div className="flex-none text-[9.5px] text-[#6f6f6f]">
          {run.tokens} tok
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAction();
          }}
          className="flex-none rounded-[5px] border px-2.5 py-[5px] text-[10px] font-bold"
          style={{
            color: run.actionFg,
            background: run.actionBg,
            borderColor: run.actionBd,
          }}
        >
          {run.actionLabel}
        </button>
      </div>
    </div>
  );
}
