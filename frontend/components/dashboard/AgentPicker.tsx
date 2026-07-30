"use client";

import type { AgentName } from "@/lib/dashboard/agents";
import type { PickerRow } from "@/lib/dashboard/view";

type Props = {
  rows: PickerRow[];
  selectedCount: number;
  onToggle: (name: AgentName) => void;
  onCancel: () => void;
  onDeploy: () => void;
};

export function AgentPicker({
  rows,
  selectedCount,
  onToggle,
  onCancel,
  onDeploy,
}: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Activate agents"
      className="absolute inset-0 z-5 flex items-center justify-center bg-[rgba(4,6,4,.78)]"
      onClick={onCancel}
    >
      <div
        className="bg-panel border-edge flex w-[680px] flex-col gap-4 rounded-xl border p-[22px]"
        style={{ boxShadow: "0 30px 80px rgba(0,0,0,.6)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="text-[14px] font-extrabold">Activate agents</div>
          <div className="flex-1" />
          <div className="text-[10px] text-[#6f6f6f]">
            {selectedCount} selected
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[5px] border border-[#232323] bg-transparent px-2.5 py-1.5 text-[10.5px] text-[#8a8a8a] hover:border-[#3a3a3a]"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={onDeploy}
            className="bg-acid hover:bg-acid-hi rounded-[5px] border-none px-[13px] py-[7px] text-[10.5px] font-bold text-[#0a0a0a] transition-colors"
          >
            deploy
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {rows.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => onToggle(p.name)}
              disabled={p.locked}
              aria-pressed={p.check === "✓"}
              className="bg-card flex items-start gap-2.5 rounded-[9px] border p-3 text-left enabled:cursor-pointer disabled:cursor-default"
              style={{ borderColor: p.borderColor }}
            >
              <div className="bg-glyph border-edge text-acid flex h-[25px] w-[25px] flex-none items-center justify-center rounded-md border text-[11px]">
                {p.glyph}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] font-bold">{p.name}</div>
                <div className="mt-[3px] text-[9.5px] leading-[1.5] text-[#7f7f7f]">
                  {p.desc}
                </div>
              </div>
              <div
                className="flex h-[17px] w-[17px] flex-none items-center justify-center rounded border text-[10px] font-extrabold text-[#0a0a0a]"
                style={{ borderColor: p.boxBd, background: p.boxBg }}
              >
                {p.check}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
