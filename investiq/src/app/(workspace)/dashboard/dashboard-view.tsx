"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowDownRight, ArrowUpRight, RefreshCw } from "lucide-react";
import { DataFreshnessPanel } from "@/components/app/data-freshness-panel";
import { CompanyLogo } from "@/components/app/company-logo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonCard } from "@/components/ui/loader";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { useToast } from "@/components/ui/toast";
import { API_BASE, syncLiveData } from "@/lib/swr";
import {
  cn,
  formatLargeNumber,
  formatNumber,
  formatOrDash,
  formatPercent,
} from "@/lib/utils";
import type {
  CompanySummary,
  DashboardInitial,
  DataFreshness,
  LiveStatus,
  MarketIndex,
} from "@/lib/types";

const KEYS = {
  companies: `${API_BASE}/companies`,
  indices: `${API_BASE}/market/indices`,
  freshness: `${API_BASE}/freshness`,
  liveStatus: `${API_BASE}/live/status`,
};

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return error ? String(error) : "The live service did not respond.";
}

export function DashboardView({ initial }: { initial: DashboardInitial }) {
  const companies = useSWR<CompanySummary[]>(KEYS.companies, {
    fallbackData: initial.companies ?? undefined,
  });
  const indices = useSWR<MarketIndex[]>(KEYS.indices, {
    fallbackData: initial.indices ?? undefined,
  });
  const freshness = useSWR<DataFreshness>(KEYS.freshness, {
    fallbackData: initial.freshness ?? undefined,
  });
  const liveStatus = useSWR<LiveStatus>(KEYS.liveStatus, {
    fallbackData: initial.liveStatus ?? undefined,
  });

  const isValidating =
    companies.isValidating || indices.isValidating || freshness.isValidating || liveStatus.isValidating;
  const error = companies.error ?? indices.error ?? freshness.error ?? liveStatus.error;

  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const { push } = useToast();

  /** Harvest fresh data upstream, then re-read every SWR key used by this view. */
  async function refresh() {
    setSyncError(null);
    setSyncing(true);
    try {
      await syncLiveData();
      await Promise.all([
        companies.mutate(),
        indices.mutate(),
        freshness.mutate(),
        liveStatus.mutate(),
      ]);
      push({ title: "Live data synced", description: "Quotes, indices and fundamentals are current.", tone: "success" });
    } catch (err) {
      const detail = messageOf(err);
      setSyncError(detail);
      push({ title: "Sync failed", description: detail, tone: "error" });
    } finally {
      setSyncing(false);
    }
  }

  const breadth = useMemo(() => {
    const all = companies.data ?? [];
    return {
      covered: all.length,
      advancing: all.filter((c) => c.changePct != null && c.changePct > 0).length,
      declining: all.filter((c) => c.changePct != null && c.changePct < 0).length,
      unreported: all.filter((c) => c.changePct == null).length,
    };
  }, [companies.data]);

  const topMovers = useMemo(() => {
    const all = companies.data ?? [];
    return [...all]
      .filter((c) => c.changePct != null && Number.isFinite(c.changePct))
      .sort((a, b) => (b.changePct as number) - (a.changePct as number))
      .slice(0, 6);
  }, [companies.data]);

  const coverageColumns = useMemo<DataTableColumn<CompanySummary>[]>(
    () => [
      {
        key: "name",
        label: "Company",
        value: (c) => c.name,
        render: (c) => (
          <div className="flex items-center gap-2.5">
            <CompanyLogo slug={c.slug} name={c.name} website={c.website} size={30} />
            <div className="min-w-0">
              <Link href={`/company/${c.slug}`} className="block truncate font-medium hover:text-primary hover:underline">
                {c.name}
              </Link>
              <div className="truncate text-[11px] text-muted-foreground">
                {c.ticker} · {c.sector} · {c.exchange}
              </div>
            </div>
          </div>
        ),
      },
      { key: "price", label: "Price", align: "right", value: (c) => c.price, render: (c) => <span className="tabular-nums">{formatOrDash(c.price, formatNumber)}</span> },
      {
        key: "changePct",
        label: "Change %",
        align: "right",
        value: (c) => c.changePct,
        render: (c) => (
          <Badge
            variant={c.changePct == null ? "outline" : c.changePct >= 0 ? "success" : "destructive"}
            className="tabular-nums"
          >
            {formatOrDash(c.changePct, (n) => formatPercent(n))}
          </Badge>
        ),
      },
      { key: "marketCap", label: "Market cap (₹ Cr)", align: "right", value: (c) => c.marketCap, render: (c) => <span className="tabular-nums">{formatOrDash(c.marketCap, formatLargeNumber)}</span> },
      { key: "peRatio", label: "P/E", align: "right", value: (c) => c.peRatio, render: (c) => <span className="tabular-nums">{formatOrDash(c.peRatio, formatNumber)}</span> },
      { key: "roe", label: "ROE %", align: "right", value: (c) => c.roe, render: (c) => <span className="tabular-nums">{formatOrDash(c.roe, formatPercent)}</span> },
      { key: "revenueGrowth", label: "Rev. growth %", align: "right", value: (c) => c.revenueGrowth, render: (c) => <span className="tabular-nums">{formatOrDash(c.revenueGrowth, formatPercent)}</span> },
    ],
    [],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Cockpit"
        title="Market overview"
        description="Real public-market data, rendered on the server and kept current in the browser."
        actions={
          isValidating ? (
            <Badge variant="outline" className="gap-1.5 text-muted-foreground">
              <RefreshCw className="h-3 w-3 animate-spin" /> Syncing…
            </Badge>
          ) : null
        }
      />

      <DataFreshnessPanel
        freshness={freshness.data ?? null}
        liveStatus={liveStatus.data ?? null}
        isValidating={isValidating || syncing}
        error={syncError ?? (error ? messageOf(error) : null)}
        onRefresh={refresh}
      />

      <section aria-labelledby="indices-heading" className="space-y-3">
        <header>
          <h2 id="indices-heading" className="text-base font-semibold">Market indices</h2>
          <p className="text-xs text-muted-foreground">Real index levels and daily moves from Yahoo Finance.</p>
        </header>

        {indices.error ? (
          <ErrorState
            title="Index data unavailable"
            description={messageOf(indices.error)}
            onRetry={() => void indices.mutate()}
          />
        ) : !indices.data ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} className="h-20" />
            ))}
          </div>
        ) : indices.data.length === 0 ? (
          <Card>
            <CardContent className="p-5 text-sm text-muted-foreground">
              The backend reported no index values.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {indices.data.map((idx) => {
              const positive = (idx.changePct ?? 0) >= 0;
              return (
                <StatTile
                  key={idx.ticker}
                  label={idx.name}
                  value={formatOrDash(idx.value, (n) => formatNumber(n))}
                  icon={positive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                  accent={positive ? "positive" : "negative"}
                  detail={
                    <Badge variant={positive ? "success" : "destructive"} className="gap-1">
                      {formatOrDash(idx.changePct, (n) => formatPercent(n, 2))}
                    </Badge>
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="movers-heading" className="space-y-3">
        <header>
          <h2 id="movers-heading" className="text-base font-semibold">Market movers</h2>
          <p className="text-xs text-muted-foreground">
            Derived from the backend&apos;s reported daily changes — no simulated prices.
          </p>
        </header>

        {companies.error ? (
          <ErrorState
            title="Company data unavailable"
            description={messageOf(companies.error)}
            onRetry={() => void companies.mutate()}
          />
        ) : !companies.data ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonCard key={i} className="h-20" />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} className="h-16" />
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <CountTile label="Companies covered" value={breadth.covered} />
              <CountTile label="Advancing" value={breadth.advancing} accent="success" />
              <CountTile label="Declining" value={breadth.declining} accent="destructive" />
              <CountTile label="Change unreported" value={breadth.unreported} />
            </div>

            <Card>
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div className="space-y-1">
                  <CardTitle>Top movers</CardTitle>
                  <CardDescription>Largest reported gains in the coverage universe.</CardDescription>
                </div>
                <Link href="/search" className="text-sm text-primary hover:underline">
                  Discover more →
                </Link>
              </CardHeader>
              <CardContent>
                {topMovers.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Daily change data is not available from the source.
                  </p>
                ) : (
                  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {topMovers.map((c) => {
                      const positive = (c.changePct ?? 0) >= 0;
                      return (
                        <li key={c.slug}>
                          <Link
                            href={`/company/${c.slug}`}
                            className="block rounded-xl border border-border/60 bg-card/40 p-3 transition-colors hover:border-primary/40"
                          >
                            <dl className="flex items-center justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-2.5">
                                <CompanyLogo slug={c.slug} name={c.name} website={c.website} size={32} />
                                <div className="min-w-0">
                                  <dt className="truncate text-sm font-medium">{c.name}</dt>
                                  <dd className="truncate text-xs text-muted-foreground">
                                    {c.ticker} · {c.sector}
                                  </dd>
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <dd className="text-sm font-semibold tabular-nums">
                                  {formatOrDash(c.price, (n) => formatNumber(n))}{" "}
                                  <span className="text-[10px] font-normal text-muted-foreground">{c.currency}</span>
                                </dd>
                                <dd className="mt-0.5">
                                  <Badge variant={positive ? "success" : "destructive"} className="tabular-nums">
                                    {c.changePct != null && positive ? "+" : ""}
                                    {formatOrDash(c.changePct, (n) => formatPercent(n))}
                                  </Badge>
                                </dd>
                              </div>
                            </dl>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </section>

      <section aria-labelledby="coverage-heading" className="space-y-3">
        <header>
          <h2 id="coverage-heading" className="text-base font-semibold">Coverage universe</h2>
          <p className="text-xs text-muted-foreground">
            Reported fundamentals for every company. Missing source values appear as —.
          </p>
        </header>
        <Card>
          <CardContent className="overflow-x-auto p-0">
            {!companies.data || companies.data.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">No companies were reported by the backend.</p>
            ) : (
              <div className="p-5">
                <DataTable
                  rows={companies.data}
                  columns={coverageColumns}
                  rowKey={(c) => c.slug}
                  filename="investiq-coverage-universe.csv"
                  initialSort={{ key: "marketCap", dir: "desc" }}
                  emptyMessage="No companies match this filter."
                />
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function CountTile({
  label,
  value,
  accent = "default",
}: {
  label: string;
  value: number;
  accent?: "default" | "success" | "destructive";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <dl>
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
          <dd
            className={cn(
              "mt-1 text-xl font-semibold tabular-nums",
              accent === "success" && "text-emerald-600 dark:text-emerald-400",
              accent === "destructive" && "text-rose-600 dark:text-rose-400",
            )}
          >
            {value.toLocaleString("en-IN")}
          </dd>
        </dl>
      </CardContent>
    </Card>
  );
}
