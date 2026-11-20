import { cn } from "@/lib/utils";

/** A single, composable metric tile used across dashboard and company views. */
export function StatTile({
  label,
  value,
  detail,
  icon,
  accent,
  className,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  icon?: React.ReactNode;
  accent?: "positive" | "negative" | "neutral";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border/60 bg-card/50 p-3.5 transition-all duration-300 hover:border-primary/40 hover:shadow-[0_10px_30px_-18px_var(--shadow-glow)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        {icon ? <span className="text-muted-foreground/70 transition-colors group-hover:text-primary">{icon}</span> : null}
      </div>
      <p
        className={cn(
          "metric-num mt-2 font-display text-xl font-semibold tracking-tight sm:text-2xl",
          accent === "positive" && "text-emerald-500",
          accent === "negative" && "text-rose-500",
        )}
      >
        {value}
      </p>
      {detail ? <div className="mt-1 text-xs text-muted-foreground">{detail}</div> : null}
      <span className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-primary/5 blur-2xl transition-opacity group-hover:opacity-100" />
    </div>
  );
}
