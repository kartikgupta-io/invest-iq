"use client";

import { useFreshness } from "@/lib/api";
import { cn, formatTimestamp } from "@/lib/utils";
import { StatusLed } from "@/components/ui/status-led";

/** Age label derived from the backend-reported age (no render-time Date.now). */
function relative(seconds: number | null): string {
  if (seconds == null) return "recently";
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

export function FreshnessIndicator() {
  const { data } = useFreshness();
  const status = data?.status ?? "offline";
  const source = data?.source ?? "unavailable";
  const label =
    status === "fresh" ? `Data ${relative(data?.ageSeconds ?? null)}` : status === "stale" ? "Data stale" : "Data offline";
  const tooltip = data?.asOf
    ? `Dataset updated ${formatTimestamp(data.asOf)} · Source: ${source}`
    : `Dataset status unavailable · Source: ${source}`;

  return (
    <span
      title={tooltip}
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium",
        status === "fresh" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
        status === "stale" && "border-amber-500/30 bg-amber-500/10 text-amber-500",
        status === "offline" && "border-muted bg-muted/40 text-muted-foreground",
      )}
    >
      <StatusLed
        tone={status === "fresh" ? "live" : status === "stale" ? "stale" : "offline"}
        className="h-1.5 w-1.5"
      />
      {label}
    </span>
  );
}
