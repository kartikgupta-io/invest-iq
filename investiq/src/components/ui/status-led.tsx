import { cn } from "@/lib/utils";

type Tone = "live" | "stale" | "offline" | "info";

const TONES: Record<Tone, string> = {
  live: "bg-[var(--led)] led-live",
  stale: "bg-amber-500",
  offline: "bg-muted-foreground",
  info: "bg-[var(--chart-2)]",
};

/** Small status LED used for live data, unread notifications and sync health. */
export function StatusLed({
  tone = "live",
  className,
  label,
}: {
  tone?: Tone;
  className?: string;
  label?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className={cn("inline-block h-2 w-2 shrink-0 rounded-full", TONES[tone], className)}
      />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
