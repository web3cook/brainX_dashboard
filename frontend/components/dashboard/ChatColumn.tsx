"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/lib/dashboard/state";

export type QuickAction = { label: string; onClick: () => void };

type Props = {
  chat: ChatMessage[];
  thinking: boolean;
  input: string;
  quick: QuickAction[];
  onInput: (value: string) => void;
  onSend: () => void;
  onConfirmAction: (index: number) => void;
  onDismissAction: (index: number) => void;
};

export function ChatColumn({
  chat,
  thinking,
  input,
  quick,
  onInput,
  onSend,
  onConfirmAction,
  onDismissAction,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view as the CMO replies.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length, thinking]);

  return (
    <div className="border-line bg-rail flex w-[372px] min-h-0 flex-none flex-col border-r">
      <div className="border-line flex flex-none items-center gap-2.5 border-b px-4 py-[14px]">
        <div className="text-acid text-[10px] tracking-[.14em]">
          {"// CMO CHAT"}
        </div>
        <div className="flex-1" />
        <div className="text-[9.5px] text-[#5f5f5f]">session · today</div>
      </div>

      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto p-4"
      >
        {chat.map((m, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <div className="text-[9.5px] tracking-[.12em] text-[#5f6f5f]">
              {m.who}
            </div>
            <div className="bg-msg border-l-edge rounded-r-[7px] border border-[#1c241c] border-l-2 px-3 py-2.5 text-[12px] leading-[1.65] text-[#d8d8d8]">
              {m.text}
            </div>

            {m.action && (
              <div className="bg-inset border-edge mt-0.5 flex flex-col gap-[9px] rounded-lg border border-dashed px-3 py-[11px]">
                <div className="text-acid text-[9.5px] tracking-[.12em]">
                  {m.action.label}
                </div>
                <div className="text-[11.5px] leading-[1.5] text-[#d8d8d8]">
                  {m.action.body}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onConfirmAction(i)}
                    className="bg-acid hover:bg-acid-hi rounded-[5px] border-none px-3 py-[7px] text-[10.5px] font-bold text-[#0a0a0a] transition-colors"
                  >
                    {m.action.confirm}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDismissAction(i)}
                    className="rounded-[5px] border border-[#2a2a2a] bg-transparent px-3 py-[7px] text-[10.5px] text-[#b4b4b4] hover:border-[#3a3a3a]"
                  >
                    not now
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {thinking && (
          <div className="text-[11px] text-[#6f8f6f]">
            CMO is thinking
            <span className="animate-[blink_1s_infinite]">▊</span>
          </div>
        )}
      </div>

      <div className="border-line flex flex-none flex-col gap-2.5 border-t bg-[#0a0d0a] px-[14px] py-3">
        <div className="flex flex-wrap gap-1.5">
          {quick.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={q.onClick}
              className="bg-inset border-line-green hover:border-edge rounded-[20px] border px-2.5 py-[5px] text-[9.5px] text-[#9f9f9f]"
            >
              {q.label}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSend();
          }}
          className="bg-inset border-edge flex items-center gap-2.5 rounded-lg border px-[13px] py-[11px]"
        >
          <span className="text-acid text-[12px]" aria-hidden="true">
            $
          </span>
          <input
            value={input}
            onChange={(e) => onInput(e.target.value)}
            placeholder="tell the CMO what to do…"
            aria-label="Message the CMO"
            className="text-ink min-w-0 flex-1 border-none bg-transparent text-[12px] outline-none placeholder:text-[#5f5f5f]"
          />
          <button
            type="submit"
            className="text-acid hover:text-acid-hi flex-none border-none bg-transparent text-[9.5px]"
          >
            ⏎ send
          </button>
        </form>
      </div>
    </div>
  );
}
