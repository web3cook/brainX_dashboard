import type { AgentCardState } from "@/lib/demo-timeline";

export function AgentCard({ card }: { card: AgentCardState }) {
  return (
    <div
      className="bg-card flex flex-col gap-[9px] rounded-[9px] border p-3 transition-[opacity,transform] duration-[350ms] ease-out"
      style={{
        borderColor: card.borderColor,
        opacity: card.opacity,
        transform: card.transform,
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="bg-glyph flex h-6 w-6 flex-none items-center justify-center rounded-md border text-[11px]"
          style={{ borderColor: card.borderColor, color: card.glyphColor }}
          aria-hidden="true"
        >
          {card.glyph}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="text-[11.5px] font-bold"
            style={{ color: card.nameColor }}
          >
            {card.name}
          </div>
          <div className="truncate text-[9px] text-[#6f6f6f]">{card.task}</div>
        </div>
        <div
          className="flex-none rounded px-1.5 py-[3px] text-[8.5px] tracking-[.1em]"
          style={{ background: card.badgeBg, color: card.badgeFg }}
        >
          {card.status}
        </div>
      </div>

      <div className="h-px bg-[#1a1f1a]" />

      <div className="flex min-h-[62px] flex-col gap-[5px] text-[10px] leading-[1.5] text-[#9f9f9f]">
        {card.lines.map((line) => (
          <div key={line} className="truncate">
            <span className="text-edge">›</span> {line}
          </div>
        ))}
        {card.summary && (
          <div
            className="overflow-hidden text-[10px] leading-[1.55] text-[#c8c8c8]"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
            }}
          >
            {card.summary}
          </div>
        )}
      </div>

      <div className="flex items-center gap-[9px]">
        <div className="bg-track h-1 flex-1 overflow-hidden rounded-sm">
          <div
            className="h-full transition-[width] duration-[400ms] ease-linear"
            style={{ width: card.pct, background: card.barColor }}
          />
        </div>
        <div className="flex-none text-[9px] text-[#6f6f6f]">{card.tokens}</div>
        <div
          className="flex-none rounded-[5px] border px-2 py-1 text-[9.5px] font-bold"
          style={{
            color: card.actionFg,
            background: card.actionBg,
            borderColor: card.actionBd,
          }}
        >
          {card.action}
        </div>
      </div>
    </div>
  );
}
