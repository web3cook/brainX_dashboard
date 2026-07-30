"use client";

import { useEffect, useRef } from "react";
import type { AutonomyMode, Plan } from "@/lib/api/types";
import type { ChatMessage } from "@/lib/dashboard/state";

export type QuickAction = { label: string; onClick: () => void };

const AUTONOMY_OPTIONS: { mode: AutonomyMode; label: string }[] = [
  { mode: "draft_only", label: "draft only" },
  { mode: "plan_then_run", label: "plan then run" },
  { mode: "just_run", label: "just run it" },
];

type Props = {
  chat: ChatMessage[];
  thinking: boolean;
  input: string;
  quick: QuickAction[];
  placeholder: string;
  showAutonomyPicker: boolean;
  autonomyMode: AutonomyMode;
  plan: Plan | null;
  planSelection: Set<string> | null;
  onSetAutonomyMode: (mode: AutonomyMode) => void;
  onTogglePhase: (phaseId: string) => void;
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
  placeholder,
  showAutonomyPicker,
  autonomyMode,
  plan,
  planSelection,
  onSetAutonomyMode,
  onTogglePhase,
  onInput,
  onSend,
  onConfirmAction,
  onDismissAction,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length, thinking]);

  return (
    // Bounded height everywhere (viewport-relative on mobile, full column on
    // desktop) so the message list's own scrollbar works consistently instead
    // of relying on an unbounded parent.
    <div className="border-line bg-rail flex h-[70vh] w-full flex-none flex-col border-b lg:h-full lg:w-[360px] lg:border-r lg:border-b-0 xl:w-[400px]">
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
        {chat.length === 0 && (
          <div className="text-[11px] leading-[1.6] text-[#6f6f6f]">
            Tell the CMO what you want the team to work on, a brief, a goal,
            a rough idea. It&rsquo;ll come back with a plan.
          </div>
        )}
        {chat.map((m, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <div className="text-[9.5px] tracking-[.12em] text-[#5f6f5f]">
              {m.who}
            </div>
            <div className="bg-msg border-l-edge rounded-r-[7px] border border-[#1c241c] border-l-2 px-3 py-2.5 text-[12px] leading-[1.65] text-[#d8d8d8]">
              {m.text}
            </div>

            {m.action && plan && planSelection && (
              <div className="bg-inset border-edge mt-0.5 flex flex-col gap-[9px] rounded-lg border border-dashed px-3 py-[11px]">
                <div className="text-acid text-[9.5px] tracking-[.12em]">
                  {m.action.label}
                </div>

                <div className="flex flex-col gap-[7px]">
                  {plan.phases.map((p) => {
                    const checked = planSelection.has(p.id);
                    return (
                      <label
                        key={p.id}
                        className="flex cursor-pointer items-start gap-2 text-[11.5px] leading-[1.4] text-[#d8d8d8]"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onTogglePhase(p.id)}
                          className="mt-[3px] accent-acid"
                        />
                        <span>
                          <span className={checked ? "" : "text-[#6f6f6f] line-through"}>{p.title}</span>
                          <span className="text-[#6f6f6f]"> · {p.assigned_agent.replace(/_/g, " ")}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onConfirmAction(i)}
                    disabled={planSelection.size === 0}
                    className="bg-acid hover:bg-acid-hi rounded-[5px] border-none px-3 py-[7px] text-[10.5px] font-bold text-[#0a0a0a] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {`run ${planSelection.size} of ${plan.phases.length} phase${plan.phases.length === 1 ? "" : "s"}`}
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
        {showAutonomyPicker && (
          <div className="flex flex-wrap gap-1.5">
            {AUTONOMY_OPTIONS.map((o) => (
              <button
                key={o.mode}
                type="button"
                onClick={() => onSetAutonomyMode(o.mode)}
                aria-pressed={autonomyMode === o.mode}
                className="rounded-[20px] border px-2.5 py-[5px] text-[9.5px]"
                style={
                  autonomyMode === o.mode
                    ? { background: "#0f1f12", borderColor: "#2f5f3f", color: "#12f94b" }
                    : { background: "transparent", borderColor: "#232323", color: "#8a8a8a" }
                }
              >
                {o.label}
              </button>
            ))}
          </div>
        )}

        {!showAutonomyPicker && (
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
        )}

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
            placeholder={placeholder}
            aria-label="Message the CMO"
            disabled={thinking}
            className="text-ink min-w-0 flex-1 border-none bg-transparent text-[12px] outline-none placeholder:text-[#5f5f5f] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={thinking}
            className="text-acid hover:text-acid-hi flex-none border-none bg-transparent text-[9.5px] disabled:opacity-50"
          >
            ⏎ send
          </button>
        </form>
      </div>
    </div>
  );
}
