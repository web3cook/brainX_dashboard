import type { Frame } from "@/lib/demo-timeline";

type Props = {
  beats: Frame["beats"];
  playing: boolean;
  onReplay: () => void;
  onToggle: () => void;
};

export function Beats({ beats, playing, onReplay, onToggle }: Props) {
  return (
    <div className="flex w-full max-w-[940px] flex-col items-center gap-4">
      <ol className="bg-track flex w-full gap-px overflow-hidden rounded-lg border border-[#161c16]">
        {beats.map((beat) => (
          <li
            key={beat.num}
            className="flex flex-1 flex-col gap-1.5 px-[14px] py-[13px] transition-colors duration-300"
            style={{ background: beat.bg }}
          >
            <div
              className="text-[9px] tracking-[.12em]"
              style={{ color: beat.numFg }}
            >
              {beat.num}
            </div>
            <div
              className="text-[10.5px] leading-[1.5]"
              style={{ color: beat.fg }}
            >
              {beat.label}
            </div>
          </li>
        ))}
      </ol>

      <div className="flex items-center gap-[14px]">
        <button
          type="button"
          onClick={onReplay}
          className="bg-acid rounded-md border-none px-[15px] py-[9px] text-[10.5px] font-bold text-[#0a0a0a]"
        >
          ↺ replay
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={!playing}
          className="rounded-md border border-[#2a2a2a] bg-transparent px-[15px] py-[9px] text-[10.5px] text-[#b4b4b4] hover:border-[#3a3a3a]"
        >
          {playing ? "❙❙ pause" : "▶ play"}
        </button>
        <div className="text-[10px] text-[#5f5f5f]">loops automatically</div>
      </div>
    </div>
  );
}
