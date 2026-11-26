"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search as SearchIcon, Building2, TrendingUp, Globe2, Sparkles } from "lucide-react";
import { useCompanies, useCompanySearch } from "@/lib/api";
import { useUiStore } from "@/store";
import { colorFromSlug } from "@/data/account";
import { formatCurrency, formatOrDash, formatPercent } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SkeletonCard } from "@/components/ui/loader";
import { EmptyState } from "@/components/ui/empty-state";

/** Opens the grounded research drawer scoped to one searched security. */
function AskAiButton({ slug, name }: { slug: string; name: string }) {
  const setAiDrawer = useUiStore((s) => s.setAiDrawer);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setAiDrawer(true, slug);
      }}
      aria-label={`Ask AI about ${name}`}
      title={`Ask AI about ${name}`}
      className="shrink-0 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
    >
      <span className="flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Ask AI</span>
    </button>
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [activeSector, setActiveSector] = useState<string>("All");
  const { data: results, isLoading, external, universe } = useCompanySearch(query);
  const { data: recommended } = useCompanies();
  const recommendedSlice = useMemo(() => recommended?.slice(0, 8) ?? [], [recommended]);

  const sectors = useMemo(() => {
    if (!query.trim() || !results) return [];
    const counts = new Map<string, number>();
    for (const r of results) counts.set(r.sector, (counts.get(r.sector) ?? 0) + 1);
    return ["All", ...[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s)];
  }, [query, results]);

  const filteredResults = useMemo(() => {
    if (!results) return [];
    if (activeSector === "All") return results;
    return results.filter((r) => r.sector === activeSector);
  }, [results, activeSector]);

  const visibleRows = filteredResults;
  const hasQuery = query.trim().length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Discover companies</h1>
        <p className="text-sm text-muted-foreground">
          Search by name or ticker across every NSE-listed domestic equity. Open any result for live
          sourced fundamentals, or use <Sparkles className="inline h-3.5 w-3.5 text-primary" /> Ask AI for a
          cited answer about that security.
        </p>
      </div>

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveSector("All");
          }}
          placeholder="Search e.g. Reliance, HDFCBANK, Energy…"
          className="h-12 pl-11 pr-4 text-base shadow-sm"
          autoFocus
        />
      </div>

      {sectors.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          {sectors.map((s) => (
            <button
              key={s}
              onClick={() => setActiveSector(s)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                activeSector === s
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/60 bg-card/40 text-muted-foreground hover:border-primary/40"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {!hasQuery && (
        <div className="space-y-6">
          <EmptyState
            icon={<SearchIcon className="h-7 w-7" />}
            title="Start searching"
            description="Type a company name or ticker above to surface live results with price, sector, and daily change."
          />
          <div>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <TrendingUp className="h-4 w-4" /> Recommended companies
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {recommendedSlice.map((c) => (
                <div
                  key={c.slug}
                  className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm backdrop-blur-xl transition-colors hover:border-primary/40"
                >
                  <Link href={`/company/${c.slug}`} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `${colorFromSlug(c.slug)}22` }}>
                        <Building2 className="h-4 w-4" style={{ color: colorFromSlug(c.slug) }} />
                      </span>
                      <Badge variant="outline">{c.ticker}</Badge>
                    </div>
                    <div>
                      <p className="truncate text-sm font-semibold">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.sector}</p>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="tabular-nums">{formatCurrency(c.price, "₹")}</span>
                      <Badge variant={c.changePct >= 0 ? "success" : "destructive"}>
                        {c.changePct >= 0 ? "+" : ""}{formatPercent(c.changePct)}
                      </Badge>
                    </div>
                  </Link>
                  <AskAiButton slug={c.slug} name={c.name} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {hasQuery && isLoading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} className="h-24" />)}
        </div>
      )}

      {hasQuery && !isLoading && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">
              {visibleRows.length} result{visibleRows.length !== 1 ? "s" : ""} for &ldquo;{query}&rdquo;
            </p>
            {universe ? (
              <Badge variant="outline" className="gap-1">
                <Building2 className="h-3 w-3" />
                {universe.count} NSE stocks indexed
              </Badge>
            ) : null}
            {external ? (
              <Badge variant="info" className="gap-1">
                <Globe2 className="h-3 w-3" />
                {external.error ? "External lookup unavailable" : external.cached ? "Cached external match" : "Best-effort external lookup"}
              </Badge>
            ) : null}
          </div>
          {visibleRows.length === 0 ? (
            <EmptyState
              icon={<SearchIcon className="h-7 w-7" />}
              title="No matches"
              description="Try a broader term, a ticker symbol, or clear the sector filter."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {visibleRows.map((c) => (
                <div
                  key={c.slug}
                  className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm backdrop-blur-xl transition-colors hover:border-primary/40"
                >
                  <Link href={`/company/${c.slug}`} className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: `${colorFromSlug(c.slug)}22` }}>
                        <Building2 className="h-5 w-5" style={{ color: colorFromSlug(c.slug) }} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.ticker} · {c.exchange} · {c.sector}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {c.liveData === false
                          ? "Load live data"
                          : formatOrDash(c.price, (value) => formatCurrency(value, "₹"))}
                      </p>
                      <Badge
                        variant={c.liveData === false || c.changePct == null ? "outline" : c.changePct >= 0 ? "success" : "destructive"}
                        className="mt-0.5"
                      >
                        {c.liveData === false
                          ? "NSE listed"
                          : formatOrDash(c.changePct, (value) => `${value >= 0 ? "+" : ""}${formatPercent(value)}`)}
                      </Badge>
                    </div>
                  </Link>
                  <AskAiButton slug={c.slug} name={c.name} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}