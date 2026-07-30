"use client";

import { useEffect, useMemo, useState } from "react";
import {
  computeFrame,
  STAGE_GUTTER,
  STAGE_HEIGHT,
  STAGE_MIN_SCALE,
  STAGE_WIDTH,
  T_END,
  TICK_MS,
} from "@/lib/demo-timeline";
import { ChatPanel } from "./ChatPanel";
import { RunsPanel } from "./RunsPanel";
import { BurnRail } from "./BurnRail";
import { Beats } from "./Beats";

/**
 * Drives the workspace demo. The stage is laid out at its intrinsic
 * 1180x660 and scaled down to fit narrow viewports, so the internal
 * proportions never reflow.
 */
export function DemoStage({ cta }: { cta: React.ReactNode }) {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () => {
      const available = Math.min(STAGE_WIDTH, window.innerWidth - STAGE_GUTTER);
      setScale(Math.max(STAGE_MIN_SCALE, available / STAGE_WIDTH));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setFrame((f) => (f >= T_END ? 0 : f + 1));
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [playing]);

  const vals = useMemo(() => computeFrame(frame), [frame]);

  return (
    <section
      id="demo"
      className="flex flex-col items-center gap-7 px-6 pb-[110px]"
    >
      <div className="flex max-w-[640px] flex-col items-center gap-3 text-center">
        <div className="text-acid text-[10px] tracking-[.16em]">
          {"// 20 SECONDS INSIDE THE WORKSPACE"}
        </div>
        <h2 className="text-2xl leading-[1.25] font-extrabold tracking-[-.8px]">
          One command. The whole department goes to work.
        </h2>
        <p className="text-[12px] leading-[1.75] text-[#8a8a8a]">
          You brief the CMO in chat. It plans, spins up the right agents, and
          streams every step. Stop anything mid-run and it reports back with a
          checkpoint.
        </p>
      </div>

      <div
        className="flex w-full justify-center overflow-hidden"
        style={{ height: Math.round(STAGE_HEIGHT * scale) }}
      >
        <div
          className="bg-stage border-line-green flex flex-none flex-col overflow-hidden rounded-xl border"
          style={{
            width: STAGE_WIDTH,
            height: STAGE_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: "top center",
            boxShadow: "0 40px 120px rgba(0,0,0,.6)",
          }}
        >
          {/* top bar */}
          <div className="border-line bg-topbar flex h-12 flex-none items-center gap-[14px] border-b px-4">
            <div className="text-[13px] font-extrabold tracking-[-.3px]">
              brain<span className="text-acid">X</span>
            </div>
            <div className="text-[10px] text-[#6f6f6f]">/ acme.xyz</div>
            <div className="flex-1" />
            <div className="bg-chip border-edge flex items-center gap-2 rounded-md border px-2.5 py-[5px] text-[10px]">
              <span className="bg-acid h-1.5 w-1.5 rounded-full animate-[blink_1.1s_infinite]" />
              <span className="text-acid font-bold">{vals.rate} tok/min</span>
              <span className="text-[#3a4a3a]">|</span>
              <span className="text-[#b4b4b4]">{vals.spend}</span>
            </div>
            <div className="border-edge text-acid flex h-[23px] w-[23px] items-center justify-center rounded-full border bg-[#1c2b1c] text-[9px] font-bold">
              RS
            </div>
          </div>

          <div className="flex min-h-0 flex-1">
            <ChatPanel
              messages={vals.messages}
              thinking={vals.thinking}
              typed={vals.typed}
            />
            <RunsPanel
              stats={vals.stats}
              cards={vals.cards}
              beatHint={vals.beatHint}
            />
            <BurnRail burn={vals.burn} spendRows={vals.spendRows} />
          </div>
        </div>
      </div>

      <Beats
        beats={vals.beats}
        playing={playing}
        onReplay={() => {
          setFrame(0);
          setPlaying(true);
        }}
        onToggle={() => setPlaying((p) => !p)}
      />

      {cta}
    </section>
  );
}
