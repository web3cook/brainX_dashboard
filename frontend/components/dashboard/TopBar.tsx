import { fmtNum } from "@/lib/dashboard/state";
import type { DashboardUser } from "./DashboardApp";

type Props = {
  user: DashboardUser;
  rate: number;
  spend: number;
  onStopAll: () => void;
  onOpenPicker: () => void;
};

export function TopBar({ user, rate, spend, onStopAll, onOpenPicker }: Props) {
  return (
    <header className="border-line bg-topbar relative z-2 flex h-14 flex-none items-center gap-4 border-b px-[18px]">
      <div className="text-[15px] font-extrabold tracking-[-.4px]">
        brain<span className="text-acid">X</span>
      </div>

      <div className="bg-msg border-line-green flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px]">
        <span className="text-[#6f6f6f]">project</span>
        <span className="font-bold">acme.xyz</span>
        <span className="text-[#6f6f6f]">▾</span>
      </div>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onStopAll}
        className="text-danger rounded-md border border-[#43201f] bg-transparent px-3 py-[7px] text-[10.5px] hover:border-danger"
      >
        ■ stop all
      </button>

      <button
        type="button"
        onClick={onOpenPicker}
        className="bg-acid hover:bg-acid-hi rounded-md border-none px-[13px] py-2 text-[10.5px] font-bold text-[#0a0a0a] transition-colors"
      >
        + hire agent
      </button>

      <div className="bg-chip border-edge flex items-center gap-2 rounded-md border px-3 py-[7px] text-[11px]">
        <span className="bg-acid h-[7px] w-[7px] rounded-full animate-[blink_1.1s_infinite]" />
        <span className="text-acid font-bold">{fmtNum(rate)} tok/min</span>
        <span className="text-[#3a4a3a]">|</span>
        <span className="text-[#b4b4b4]">${spend.toFixed(2)} today</span>
      </div>

      <div className="flex items-center gap-[9px] text-[11px] text-[#b4b4b4]">
        <div className="border-edge text-acid flex h-[27px] w-[27px] flex-none items-center justify-center rounded-full border bg-[#1c2b1c] text-[10px] font-bold">
          {user.initials}
        </div>
        <span className="max-w-[180px] truncate">{user.email}</span>
      </div>
    </header>
  );
}
