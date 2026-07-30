"use client";

import { useFormStatus } from "react-dom";
import { signInWithGoogle } from "@/app/actions/auth";

const SIZES = {
  lg: {
    button: "px-[26px] py-[15px] text-[13px]",
    glyph: "h-[19px] w-[19px] text-[11px]",
  },
  md: {
    button: "px-[24px] py-[14px] text-[12.5px]",
    glyph: "h-[18px] w-[18px] text-[10px]",
  },
} as const;

function Submit({ size }: { size: keyof typeof SIZES }) {
  const { pending } = useFormStatus();
  const s = SIZES[size];

  return (
    <button
      type="submit"
      disabled={pending}
      className={`bg-chip border-edge hover:bg-chip-hover hover:border-acid text-ink flex items-center gap-3 rounded-[9px] border font-bold transition-colors disabled:cursor-wait disabled:opacity-70 ${s.button}`}
      style={
        size === "lg"
          ? { boxShadow: "0 0 40px rgba(18,249,75,.08)" }
          : undefined
      }
    >
      <span
        className={`bg-ink flex flex-none items-center justify-center rounded-full font-extrabold text-[#0a0a0a] ${s.glyph}`}
        aria-hidden="true"
      >
        G
      </span>
      {pending ? "Connecting…" : "Log in with Google"}
    </button>
  );
}

export function GoogleButton({ size = "lg" }: { size?: keyof typeof SIZES }) {
  return (
    <form action={signInWithGoogle}>
      <Submit size={size} />
    </form>
  );
}
