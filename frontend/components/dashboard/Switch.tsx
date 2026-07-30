import { switchView } from "@/lib/dashboard/view";

/** Purely presentational pill switch; the parent row owns the click target. */
export function Switch({ on }: { on: boolean }) {
  const s = switchView(on);
  return (
    <span
      className="flex h-[14px] w-[26px] flex-none items-center rounded-lg px-[2px]"
      style={{ background: s.bg, justifyContent: s.justify }}
      aria-hidden="true"
    >
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ background: s.knob }}
      />
    </span>
  );
}
