"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Check,
  ExternalLink,
  FileText,
  Gauge,
  RefreshCw,
  Search,
  TrendingUp,
  WifiOff,
  X,
} from "lucide-react";
import type { EChartsCoreOption } from "echarts/core";
import { EChart } from "@/components/charts/echart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { cn, formatNumber, formatPercent } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Backend contract                                                    */
/* ------------------------------------------------------------------ */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

type LiveStatus = {
  cached: boolean;
  savedAt: string | null;
  companies: number;
  evidenceCount: number;
  sources: string[];
};

type Quote = {
  ticker: string;
  price: number;
  changePct: number;
  previousClose: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  currency: string;
  asOf: string;
  source: string;
  stale?: boolean;
};

type Citation = { title: string; url: string };

type Profile = {
  slug: string;
  name: string;
  about: string;
  marketCapCr: number;
  price: number;
  peRatio: number;
  bookValue: number;
  dividendYield: number;
  roce: number;
  roe: number;
  pros: string[];
  cons: string[];
  citations: Citation[];
  asOf: string;
  source: string;
  stale?: boolean;
};

type SearchHit = {
  id: string;
  company: string;
  title: string;
  snippet: string;
  url: string;
  score: number;
  source: string;
};

type SearchResult = {
  query: string;
  hits: SearchHit[];
  asOf: string;
  source: string;
};

type CompareItem = {
  ticker: string;
  name: string;
  price: number;
  changePct: number;
  peRatio: number;
  roe: number;
  marketCapCr: number;
  asOf: string;
};

type CompareResult = {
  items: CompareItem[];
  asOf: string;
  source: string;
};

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

const COMPANIES = [
  { ticker: "RELIANCE", slug: "reliance", name: "Reliance Industries" },
  { ticker: "TCS", slug: "tcs", name: "Tata Consultancy Services" },
  { ticker: "INFY", slug: "infosys", name: "Infosys" },
  { ticker: "HDFCBANK", slug: "hdfc-bank", name: "HDFC Bank" },
  { ticker: "ITC", slug: "itc", name: "ITC" },
] as const;

const PEER_SYMBOLS = "RELIANCE,TCS,INFY";

const EXAMPLE_QUESTIONS = [
  "What is Reliance's return on capital employed?",
  "How did TCS revenue grow this year?",
  "What risks does HDFC Bank disclose?",
];

/* ------------------------------------------------------------------ */
/* Request plumbing — errors are surfaced, never replaced with fixtures */
/* ------------------------------------------------------------------ */

class LiveRequestError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
    this.name = "LiveRequestError";
  }
}

async function requestLive<T>(path: string, body: string | null, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const relayAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", relayAbort);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: body === null ? "GET" : "POST",
      headers: {
        Accept: "application/json",
        ...(body === null ? {} : { "Content-Type": "application/json" }),
      },
      body: body ?? undefined,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new LiveRequestError(response.status);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", relayAbort);
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "The request timed out.";
  if (error instanceof LiveRequestError) return `The live service returned HTTP ${error.status}.`;
  if (error instanceof Error && error.message) return error.message;
  return "Could not reach the live data service.";
}

function useLiveRequest<T>(config: {
  path: string | null;
  body?: string | null;
  key?: string;
  enabled?: boolean;
}) {
  const { path, body = null, key = "", enabled = true } = config;
  const active = enabled && path !== null;
  const query = useQuery<T, Error>({
    queryKey: ["live-demo", path, body, key],
    queryFn: async ({ signal }) => {
      if (!path) throw new Error("No endpoint configured");
      try {
        return await requestLive<T>(path, body, signal);
      } catch (error) {
        throw new Error(errorMessage(error));
      }
    },
    enabled: active,
    retry: false,
    staleTime: 0,
  });

  return {
    data: query.data ?? null,
    loading: active && query.isPending,
    error: active ? query.error?.message ?? null : null,
    reload: () => {
      void query.refetch();
    },
  };
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(date)} IST`;
}

function formatMoney(value: number, currency: string): string {
  if (!Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${formatNumber(value)} ${currency}`.trim();
  }
}

function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

function ratio(value: number | undefined, formatter: (n: number) => string): string {
  return typeof value === "number" && Number.isFinite(value) ? formatter(value) : "—";
}

function relevancePercent(score: number): string {
  if (!Number.isFinite(score)) return "—";
  const value = score > 1 ? score : score * 100;
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function ChangeBadge({ value }: { value: number }) {
  if (!Number.isFinite(value)) return <Badge variant="secondary">—</Badge>;
  const positive = value >= 0;
  return (
    <Badge variant={positive ? "success" : "destructive"} className="gap-1 tabular-nums">
      {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {positive ? "+" : ""}
      {formatPercent(value)}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function LiveDemoPage() {
  const [activeTicker, setActiveTicker] = React.useState<string>(COMPANIES[0].ticker);
  const [activeSlug, setActiveSlug] = React.useState<string>(COMPANIES[0].slug);
  const [searchInput, setSearchInput] = React.useState("");
  const [submitted, setSubmitted] = React.useState<{ query: string; id: number } | null>(null);
  const searchId = React.useRef(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const [refreshNote, setRefreshNote] = React.useState<string | null>(null);

  const status = useLiveRequest<LiveStatus>({ path: "/live/status" });
  const quote = useLiveRequest<Quote>({ path: `/live/quote/${activeTicker}`, key: activeTicker });
  const profile = useLiveRequest<Profile>({ path: `/live/profile/${activeSlug}`, key: activeSlug });
  const search = useLiveRequest<SearchResult>({
    path: submitted ? "/live/search" : null,
    body: submitted ? JSON.stringify({ query: submitted.query, limit: 8 }) : null,
    key: submitted ? String(submitted.id) : "",
    enabled: !!submitted,
  });
  const compare = useLiveRequest<CompareResult>({
    path: `/live/compare?symbols=${encodeURIComponent(PEER_SYMBOLS)}`,
  });

  const compareColumns = React.useMemo<DataTableColumn<CompareItem>[]>(
    () => [
      { key: "ticker", label: "Ticker", value: (item) => item.ticker, render: (item) => <span className="font-semibold">{item.ticker}</span> },
      { key: "name", label: "Company", value: (item) => item.name, render: (item) => <span className="text-muted-foreground">{item.name}</span> },
      { key: "price", label: "Price", align: "right", value: (item) => item.price, render: (item) => <span className="tabular-nums">{ratio(item.price, (n) => formatMoney(n, "INR"))}</span> },
      { key: "changePct", label: "Change %", align: "right", value: (item) => item.changePct, render: (item) => <div className="flex justify-end"><ChangeBadge value={item.changePct} /></div> },
      { key: "peRatio", label: "P/E", align: "right", value: (item) => item.peRatio, render: (item) => <span className="tabular-nums">{ratio(item.peRatio, formatNumber)}</span> },
      { key: "roe", label: "ROE %", align: "right", value: (item) => item.roe, render: (item) => <span className="tabular-nums">{ratio(item.roe, formatPercent)}</span> },
      { key: "marketCapCr", label: "Mkt cap (₹ Cr)", align: "right", value: (item) => item.marketCapCr, render: (item) => <span className="tabular-nums">{ratio(item.marketCapCr, (n) => formatNumber(n, 0))}</span> },
      { key: "asOf", label: "As of", value: (item) => item.asOf, render: (item) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatTimestamp(item.asOf)}</span> },
    ],
    [],
  );

  const activeCompany = COMPANIES.find((c) => c.ticker === activeTicker) ?? COMPANIES[0];
  const profileCompany = COMPANIES.find((c) => c.slug === activeSlug) ?? COMPANIES[0];

  const rangeOption = React.useMemo<EChartsCoreOption | null>(() => {
    const q = quote.data;
    if (!q) return null;
    const values = [q.dayLow, q.dayHigh, q.fiftyTwoWeekLow, q.fiftyTwoWeekHigh, q.price];
    if (!values.every((v) => typeof v === "number" && Number.isFinite(v))) return null;
    const low = Math.min(...values);
    const high = Math.max(...values);
    const padding = (high - low) * 0.08 || 1;
    return {
      grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "value",
        min: low - padding,
        max: high + padding,
        axisLabel: { formatter: (v: number) => formatNumber(v, 0) },
        splitLine: { lineStyle: { color: "oklch(0.5 0 0 / 0.15)", type: "dashed" } },
      },
      yAxis: { type: "category", data: ["Day range", "52-week range"] },
      series: [
        {
          name: "Observed range",
          type: "bar",
          barWidth: 12,
          data: [
            [q.dayLow, q.dayHigh],
            [q.fiftyTwoWeekLow, q.fiftyTwoWeekHigh],
          ],
          itemStyle: { color: "oklch(0.62 0.17 285)", borderRadius: 6 },
        },
        {
          name: "Current price",
          type: "scatter",
          symbolSize: 11,
          data: [
            [q.price, "Day range"],
            [q.price, "52-week range"],
          ],
          itemStyle: { color: "oklch(0.82 0.18 155)", borderColor: "oklch(0.2 0.02 285)", borderWidth: 2 },
        },
      ],
    } as EChartsCoreOption;
  }, [quote.data]);

  function submitSearch(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return;
    searchId.current += 1;
    setSearchInput(trimmed);
    setSubmitted({ query: trimmed, id: searchId.current });
  }

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshNote(null);
    let refreshed = false;
    // The contract does not guarantee a refresh endpoint: try the usual POST,
    // fall back to GET, then simply re-check status. Never simulate a refresh.
    try {
      await requestLive("/live/refresh", "{}");
      refreshed = true;
    } catch (error) {
      const statusCode = error instanceof LiveRequestError ? error.status : 0;
      if (statusCode === 404 || statusCode === 405) {
        try {
          await requestLive("/live/refresh", null);
          refreshed = true;
        } catch {
          refreshed = false;
        }
      }
    }
    setRefreshNote(
      refreshed
        ? "Backend refresh requested. Status re-checked."
        : "No refresh endpoint available — re-checked the current status.",
    );
    status.reload();
    setRefreshing(false);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Activity className="h-5 w-5" />
            </span>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">Live Intelligence Demo</h1>
              <p className="text-sm text-muted-foreground">Real public data, fetched on demand — nothing simulated.</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={cn(refreshing && "animate-spin")} />
              {refreshing ? "Refreshing…" : "Refresh data"}
            </Button>
            {refreshNote && <p className="text-xs text-muted-foreground">{refreshNote}</p>}
          </div>
        </div>

        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Quotes are sourced from Yahoo Finance, fundamentals and cited evidence from Screener.in and issuer
          filings. Every figure and snippet on this page comes from the live backend. If the service is
          unavailable you will see an error state instead of placeholder numbers.
        </p>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-2 backdrop-blur-xl">
          <StatusBadge status={status} />
          {status.data && status.data.sources.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {status.data.sources.map((source) => (
                <Badge key={source} variant="outline" className="text-muted-foreground">
                  {source}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* 1 — Live quotes */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Live quotes
            </CardTitle>
            <CardDescription>Latest observed price and ranges for the selected ticker.</CardDescription>
          </div>
          <Tabs value={activeTicker} onValueChange={setActiveTicker}>
            <TabsList className="h-auto flex-wrap">
              {COMPANIES.map((company) => (
                <TabsTrigger key={company.ticker} value={company.ticker}>
                  {company.ticker}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {quote.loading ? (
            <QuoteSkeleton />
          ) : quote.error || !quote.data ? (
            <BackendOffline error={quote.error} onRetry={quote.reload} />
          ) : (
            <QuoteView quote={quote.data} name={activeCompany.name} option={rangeOption} />
          )}
        </CardContent>
      </Card>

      {/* 2 — Fundamentals & cited evidence */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" /> Fundamentals &amp; cited evidence
            </CardTitle>
            <CardDescription>Reported ratios and the original sources behind each profile.</CardDescription>
          </div>
          <Tabs value={activeSlug} onValueChange={setActiveSlug}>
            <TabsList className="h-auto flex-wrap">
              {COMPANIES.map((company) => (
                <TabsTrigger key={company.slug} value={company.slug}>
                  {company.ticker}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {profile.loading ? (
            <ProfileSkeleton />
          ) : profile.error || !profile.data ? (
            <BackendOffline error={profile.error} onRetry={profile.reload} />
          ) : (
            <ProfileView profile={profile.data} fallbackName={profileCompany.name} />
          )}
        </CardContent>
      </Card>

      {/* 3 — Evidence search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> Evidence search (USP)
          </CardTitle>
          <CardDescription>
            Results are scored over real harvested snippets and link back to their original sources.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch(searchInput);
            }}
          >
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Ask a question about a company’s filings…"
              aria-label="Evidence search query"
              className="min-w-56 flex-1"
            />
            <Button type="submit" disabled={!searchInput.trim() || search.loading}>
              <Search /> Search evidence
            </Button>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Try:</span>
            {EXAMPLE_QUESTIONS.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => submitSearch(question)}
                className="rounded-full border border-border/60 bg-card/40 px-3 py-1 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {question}
              </button>
            ))}
          </div>

          {search.loading ? (
            <LoadingRows count={4} />
          ) : search.error || !search.data ? (
            submitted ? (
              <BackendOffline error={search.error} onRetry={search.reload} />
            ) : (
              <EmptyState
                icon={<Search className="h-6 w-6" />}
                title="Search real evidence"
                description="Ask a question above or pick an example to see scored snippets from harvested public sources."
              />
            )
          ) : search.data.hits.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-6 w-6" />}
              title="No evidence matched"
              description={`No snippets scored above the threshold for “${search.data.query}”. Try a different question.`}
            />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {search.data.hits.length} results for <span className="text-foreground">{search.data.query}</span>
                </span>
                <span>
                  {search.data.source} · as of {formatTimestamp(search.data.asOf)}
                </span>
              </div>
              {search.data.hits.map((hit) => (
                <div key={hit.id} className="rounded-xl border border-border/60 bg-card/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{hit.company}</Badge>
                      <p className="text-sm font-semibold">{hit.title}</p>
                    </div>
                    <Badge variant="info" className="tabular-nums">
                      {relevancePercent(hit.score)} relevance
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{hit.snippet}</p>
                  {hit.url && (
                    <a
                      href={hit.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      View original source <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4 — Peer comparison */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" /> Peer comparison
            </CardTitle>
            <CardDescription>Side-by-side ratios for {PEER_SYMBOLS.split(",").join(" · ")}.</CardDescription>
          </div>
          {compare.data && (
            <Badge variant="outline">
              {compare.data.source} · {formatTimestamp(compare.data.asOf)}
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {compare.loading ? (
            <LoadingRows count={3} />
          ) : compare.error || !compare.data ? (
            <BackendOffline error={compare.error} onRetry={compare.reload} />
          ) : compare.data.items.length === 0 ? (
            <EmptyState
              icon={<Gauge className="h-6 w-6" />}
              title="No peers returned"
              description="The backend responded without comparison rows for the requested symbols."
            />
          ) : (
            <DataTable
              rows={compare.data.items}
              columns={compareColumns}
              rowKey={(item) => item.ticker}
              filename="investiq-peer-comparison.csv"
              initialSort={{ key: "marketCapCr", dir: "desc" }}
              emptyMessage="No peers match this filter."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: ReturnType<typeof useLiveRequest<LiveStatus>> }) {
  if (status.loading) {
    return (
      <Badge variant="secondary" className="gap-1.5">
        <Activity className="h-3 w-3 animate-pulse" /> Checking live status…
      </Badge>
    );
  }
  if (status.error || !status.data) {
    return (
      <Badge variant="destructive" className="gap-1.5">
        <WifiOff className="h-3 w-3" /> Backend offline
      </Badge>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={status.data.cached ? "info" : "success"} className="gap-1.5">
        {status.data.cached ? <Gauge className="h-3 w-3" /> : <Activity className="h-3 w-3" />}
        {status.data.cached ? "Cached snapshot" : "Fresh snapshot"}
      </Badge>
      <span className="text-xs text-muted-foreground">
        {status.data.evidenceCount} evidence snippets · {status.data.companies} companies · as of{" "}
        {formatTimestamp(status.data.savedAt)}
      </span>
    </div>
  );
}

function BackendOffline({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <ErrorState
      title="Backend offline"
      description={
        error
          ? `${error} No sample values are shown — start the live API and retry.`
          : "The live service returned no data. No sample values are shown — please retry."
      }
      onRetry={onRetry}
    />
  );
}

function QuoteView({ quote, name, option }: { quote: Quote; name: string; option: EChartsCoreOption | null }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {quote.ticker} · {name}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-3xl font-semibold tabular-nums">{formatMoney(quote.price, quote.currency)}</p>
            <ChangeBadge value={quote.changePct} />
            {quote.stale && <Badge variant="warning">Stale quote</Badge>}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Source: {quote.source} · as of {formatTimestamp(quote.asOf)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Previous close" value={formatMoney(quote.previousClose, quote.currency)} />
        <StatTile
          label="Day range"
          value={`${formatNumber(quote.dayLow)} – ${formatNumber(quote.dayHigh)}`}
        />
        <StatTile
          label="52-week range"
          value={`${formatNumber(quote.fiftyTwoWeekLow)} – ${formatNumber(quote.fiftyTwoWeekHigh)}`}
        />
        <StatTile label="Volume" value={formatCompact(quote.volume)} />
      </div>

      {option ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Observed ranges from this quote — no historical path is inferred.
          </p>
          <EChart option={option} height={150} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Chart unavailable: the quote did not include complete range fields.
        </p>
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ProfileView({ profile, fallbackName }: { profile: Profile; fallbackName: string }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">{profile.name || fallbackName}</h3>
            <Badge variant="outline">{profile.slug}</Badge>
            {profile.stale && <Badge variant="warning">Stale data</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            Source: {profile.source} · as of {formatTimestamp(profile.asOf)}
          </p>
        </div>
        <p className="text-sm font-semibold tabular-nums">{formatMoney(profile.price, "INR")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Market cap" value={`${ratio(profile.marketCapCr, (n) => formatNumber(n, 0))} Cr`} />
        <StatTile label="P/E" value={ratio(profile.peRatio, (n) => formatNumber(n))} />
        <StatTile label="ROE" value={ratio(profile.roe, (n) => formatPercent(n))} />
        <StatTile label="ROCE" value={ratio(profile.roce, (n) => formatPercent(n))} />
        <StatTile label="Dividend yield" value={ratio(profile.dividendYield, (n) => formatPercent(n))} />
        <StatTile label="Book value" value={formatMoney(profile.bookValue, "INR")} />
      </div>

      {profile.about && <p className="text-sm leading-relaxed text-muted-foreground">{profile.about}</p>}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Pros</p>
          {profile.pros.length ? (
            <ul className="space-y-1.5">
              {profile.pros.map((pro) => (
                <li key={pro} className="flex gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span>{pro}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No pros published by the source.</p>
          )}
        </div>
        <div className="space-y-2 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
          <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">Cons</p>
          {profile.cons.length ? (
            <ul className="space-y-1.5">
              {profile.cons.map((con) => (
                <li key={con} className="flex gap-2 text-sm text-muted-foreground">
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                  <span>{con}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No cons published by the source.</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">Citations</p>
        {profile.citations.length ? (
          <ul className="flex flex-wrap gap-2">
            {profile.citations.map((citation) => (
              <li key={`${citation.title}-${citation.url}`}>
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                  {citation.title}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No citations were supplied with this profile.</p>
        )}
      </div>
    </div>
  );
}

function QuoteSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-16" />
        ))}
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-16" />
        ))}
      </div>
      <Skeleton className="h-16 w-full" />
      <div className="grid gap-3 md:grid-cols-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  );
}

function LoadingRows({ count }: { count: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-center gap-4">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}
