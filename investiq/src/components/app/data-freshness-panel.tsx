"use client";

import { Activity, ChevronDown, Database, RefreshCw, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatTimestamp } from "@/lib/utils";
import { StatusLed } from "@/components/ui/status-led";
import type { DataFreshness, LiveStatus } from "@/lib/types";

export interface DataFreshnessPanelProps {
  freshness: DataFreshness | null;
  liveStatus: LiveStatus | null;
  /** Fields the backend could not source for this particular view. */
  unavailable?: string[];
  /** Provenance mode reported by the company payload, when available. */
  mode?: "live" | "legacy";
  provenanceSources?: string[];
  provenanceAsOf?: string | null;
  isValidating?: boolean;
  error?: string | null;
  onRefresh: () => void;
}

export function DataFreshnessPanel({
  freshness,
  liveStatus,
  unavailable = [],
  mode,
  provenanceSources = [],
  provenanceAsOf,
  isValidating = false,
  error = null,
  onRefresh,
}: DataFreshnessPanelProps) {
  const status = freshness?.status ?? "offline";
  const statusLabel = status === "fresh" ? "Fresh" : status === "stale" ? "Stale" : "Offline";
  const badgeVariant = status === "fresh" ? "success" : status === "stale" ? "warning" : "destructive";
  const StatusIcon = status === "offline" ? WifiOff : Activity;

  const sources = Array.from(
    new Set(
      [freshness?.source, ...(liveStatus?.sources ?? []), ...provenanceSources].filter(
        (s): s is string => typeof s === "string" && s.trim().length > 0,
      ),
    ),
  );
  const asOf = provenanceAsOf ?? freshness?.asOf ?? liveStatus?.savedAt ?? null;

  return (
    <section
      aria-labelledby="data-freshness-heading"
      className="glass-panel overflow-hidden rounded-2xl border-primary/25 p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="data-freshness-heading" className="flex items-center gap-2 text-base font-semibold">
            <Database className="h-4 w-4 text-primary" /> Data freshness &amp; sync
          </h2>
          <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Every figure on this page comes from the live backend. Unsourced fields are shown as —, never filled
            with sample values.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mode && (
            <Badge variant={mode === "live" ? "success" : "info"} className="uppercase tracking-wide">
              {mode} data
            </Badge>
          )}
          <Badge variant={badgeVariant} className="gap-1.5">
            <StatusLed tone={status === "fresh" ? "live" : status === "stale" ? "stale" : "offline"} className="h-1.5 w-1.5" />
            <StatusIcon className={cn("h-3 w-3", isValidating && "animate-pulse")} />
            {statusLabel}
          </Badge>
        </div>
      </header>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <div className="space-y-1">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Reported sources</dt>
          <dd className="flex flex-wrap gap-1.5 text-sm font-medium">
            {sources.length ? (
              sources.map((source) => (
                <Badge key={source} variant="outline" className="text-xs">
                  {source}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">As of</dt>
          <dd className="text-sm font-medium tabular-nums">
            {asOf ? <time dateTime={asOf}>{formatTimestamp(asOf)}</time> : <span className="text-muted-foreground">—</span>}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Evidence snippets</dt>
          <dd className="text-sm font-semibold tabular-nums">{liveStatus?.evidenceCount ?? "—"}</dd>
        </div>
        <div className="space-y-1">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Companies synced</dt>
          <dd className="text-sm font-semibold tabular-nums">{liveStatus?.companies ?? "—"}</dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={isValidating}>
            <RefreshCw className={cn("h-4 w-4", isValidating && "animate-spin")} />
            {isValidating ? "Refreshing…" : "Refresh now"}
          </Button>
          <p aria-live="polite" className="text-xs text-muted-foreground">
            {isValidating
              ? "Refreshing live data…"
              : error
                ? "Refresh failed — showing the last known data."
                : "Live data checked."}
          </p>
        </div>
        {freshness?.staleAfterSeconds != null && (
          <p className="text-[11px] text-muted-foreground">
            Treated as stale after {freshness.staleAfterSeconds.toLocaleString("en-IN")}s
            {freshness.ageSeconds != null ? ` · current age ${freshness.ageSeconds.toLocaleString("en-IN")}s` : ""}
          </p>
        )}
      </div>

      <details className="group mt-4 rounded-xl border border-border/60 bg-card/40 px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
          What is real / what is unavailable
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
          <p>
            Real: quotes from Yahoo Finance and fundamentals/evidence from Screener.in and issuer filings, as
            reported by the backend. Values the sources did not provide are rendered as —.
          </p>
          {unavailable.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5">
              {unavailable.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p>No per-field availability details were reported for this view.</p>
          )}
        </div>
      </details>
    </section>
  );
}
