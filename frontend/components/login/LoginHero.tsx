import Image from "next/image";
import { GoogleButton } from "./GoogleButton";

export function LoginHero() {
  // `overflow-hidden` clips the decorative glow, which is wider than a phone
  // viewport and would otherwise force horizontal page scroll.
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-20 pb-12">
      {/* graph-paper grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(18,249,75,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(18,249,75,.03) 1px,transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
      {/* ambient bloom behind the mark */}
      <div
        aria-hidden="true"
        data-ambient-motion
        className="pointer-events-none absolute top-[26%] left-1/2 h-[620px] w-[620px] -ml-[310px] rounded-full animate-[glow_6s_ease-in-out_infinite]"
        style={{
          background:
            "radial-gradient(circle,rgba(18,249,75,.13),transparent 62%)",
        }}
      />

      <div className="relative flex flex-col items-center gap-[26px]">
        <Image
          src="/brainx-logo-black.png"
          alt="brainX"
          width={128}
          height={128}
          priority
          className="block rounded-[18px]"
        />

        <div className="flex flex-col items-center gap-3">
          <h1 className="text-[34px] font-extrabold tracking-[-1.4px]">
            brain
            <span
              className="text-acid"
              style={{ textShadow: "0 0 30px rgba(18,249,75,.45)" }}
            >
              X
            </span>
          </h1>
          <p className="text-[12.5px] tracking-[.04em] text-[#8a8a8a]">
            the AI CMO running your entire marketing
          </p>
        </div>

        <GoogleButton size="lg" />

        <p className="text-center text-[10.5px] leading-[1.8] text-[#5f5f5f]">
          no card required · $5 of agent runs on the house
          <br />
          by continuing you agree to the <a href="#">terms</a> and{" "}
          <a href="#">privacy policy</a>
        </p>
      </div>

      <a
        href="#demo"
        data-ambient-motion
        className="relative mt-14 flex flex-col items-center gap-[9px] text-[9.5px] tracking-[.16em] !text-[#5f6f5f] animate-[bob_2.4s_ease-in-out_infinite] hover:!text-acid"
      >
        SEE IT WORK
        <span className="text-acid text-[14px]" aria-hidden="true">
          ↓
        </span>
      </a>
    </div>
  );
}
