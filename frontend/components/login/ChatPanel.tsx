import type { Frame } from "@/lib/demo-timeline";

type Props = Pick<Frame, "messages" | "thinking" | "typed">;

export function ChatPanel({ messages, thinking, typed }: Props) {
  return (
    <div className="bg-rail border-line flex w-[318px] flex-none flex-col border-r">
      <div className="border-line text-acid border-b px-[14px] py-3 text-[9.5px] tracking-[.14em]">
        {"// CMO CHAT"}
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-hidden p-[14px]">
        {messages.map((m, i) => (
          <div key={`${m.who}-${i}`} className="flex flex-col gap-[5px]">
            <div className="text-[9px] tracking-[.12em] text-[#5f6f5f]">
              {m.who}
            </div>
            <div className="bg-msg border-l-edge rounded-r-[7px] border border-[#1c241c] border-l-2 px-[11px] py-[9px] text-[11px] leading-[1.6] text-[#d8d8d8]">
              {m.text}
            </div>
          </div>
        ))}

        {thinking && (
          <div className="text-[10.5px] text-[#6f8f6f]">
            CMO is planning
            <span className="animate-[blink_0.9s_infinite]">▊</span>
          </div>
        )}
      </div>

      <div className="border-line flex min-h-[44px] items-center gap-[9px] border-t bg-[#0a0d0a] px-[13px] py-[11px]">
        <span className="text-acid text-[11px]" aria-hidden="true">
          $
        </span>
        <span className="text-ink flex-1 text-[11px]">
          {typed}
          <span className="text-acid animate-[blink_0.8s_infinite]">▊</span>
        </span>
      </div>
    </div>
  );
}
