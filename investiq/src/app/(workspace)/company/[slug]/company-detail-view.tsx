"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  FileText,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { CompanyAiPanel } from "@/components/app/company-ai-panel";
import { DataFreshnessPanel } from "@/components/app/data-freshness-panel";
import { CompanyLogo } from "@/components/app/company-logo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useToast } from "@/components/ui/toast";
import { API_BASE, syncLiveData } from "@/lib/swr";
import { useCompanyExtras, usePeers } from "@/lib/api";
import {
  cn,
  formatLargeNumber,
  formatNumber,
  formatOrDash,
  formatPercent,
  formatTimestamp,
} from "@/lib/utils";
import type {
  AnnualFinancials,
  Company,
  CompanyDetailInitial,
  DataFreshness,
  LiveStatus,
  PeerCompany,
} from "@/lib/types";
import { CompanyDetailSkeleton } from "./company-detail-skeleton";

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return error ? String(error) : "The live service did not respond.";
}

const annualColumns: DataTableColumn<AnnualFinancials>[] = [
  { key: "year", label: "Year", value: (a) => a.year, render: (a) => <span className="font-medium">{a.year}</span> },
  { key: "revenue", label: "Revenue (₹ Cr)", align: "right", value: (a) => a.revenue, render: (a) => <span className="tabular-nums">{formatOrDash(a.revenue, formatLargeNumber)}</span> },
  { key: "revenueGrowth", label: "Growth %", align: "right", value: (a) => a.revenueGrowth, render: (a) => <span className="tabular-nums">{formatOrDash(a.revenueGrowth, formatPercent)}</span> },
  { key: "netIncome", label: "Net income (₹ Cr)", align: "right", value: (a) => a.netIncome, render: (a) => <span className="tabular-nums">{formatOrDash(a.netIncome, formatLargeNumber)}</span> },
  { key: "eps", label: "EPS", align: "right", value: (a) => a.eps, render: (a) => <span className="tabular-nums">{formatOrDash(a.eps, formatNumber)}</span> },
  { key: "netMargin", label: "Net margin %", align: "right", value: (a) => a.netMargin, render: (a) => <span className="tabular-nums">{formatOrDash(a.netMargin, formatPercent)}</span> },
  { key: "roe", label: "ROE %", align: "right", value: (a) => a.roe, render: (a) => <span className="tabular-nums">{formatOrDash(a.roe, formatPercent)}</span> },
  { key: "freeCashFlow", label: "Free CF (₹ Cr)", align: "right", value: (a) => a.freeCashFlow, render: (a) => <span className="tabular-nums">{formatOrDash(a.freeCashFlow, formatLargeNumber)}</span> },
];

type PeerRow = PeerCompany & { current?: boolean };

const peerColumns: DataTableColumn<PeerRow>[] = [
  {
    key: "name",
    label: "Company",
    value: (p) => p.name,
    render: (p) => (
      <span className="font-medium">
        {p.name}
        {p.current ? <Badge variant="outline" className="ml-2">This company</Badge> : null}
      </span>
    ),
  },
  { key: "ticker", label: "Ticker", value: (p) => p.ticker },
  {
    key: "marketCap",
    label: "Market cap (₹ Cr)",
    align: "right",
    value: (p) => p.marketCap,
    render: (p) => <span className="tabular-nums">{formatOrDash(p.marketCap, formatLargeNumber)}</span>,
  },
  {
    key: "peRatio",
    label: "P/E",
    align: "right",
    value: (p) => p.peRatio,
    render: (p) => <span className="tabular-nums">{formatOrDash(p.peRatio, formatNumber)}</span>,
  },
  {
    key: "roe",
    label: "ROE",
    align: "right",
    value: (p) => p.roe,
    render: (p) => <span className="tabular-nums">{formatOrDash(p.roe, formatPercent)}</span>,
  },
  {
    key: "margin",
    label: "Net margin",
    align: "right",
    value: (p) => p.margin,
    render: (p) => <span className="tabular-nums">{formatOrDash(p.margin, formatPercent)}</span>,
  },
  {
    key: "revenueGrowth",
    label: "Revenue growth",
    align: "right",
    value: (p) => p.revenueGrowth,
    render: (p) => <span className="tabular-nums">{formatOrDash(p.revenueGrowth, formatPercent)}</span>,
  },
  {
    key: "returnYtd",
    label: "Day change",
    align: "right",
    value: (p) => p.returnYtd,
    render: (p) => <span className="tabular-nums">{formatOrDash(p.returnYtd, formatPercent)}</span>,
  },
];

export function CompanyDetailView({ slug, initial }: { slug: string; initial: CompanyDetailInitial }) {
  const company = useSWR<Company>(`${API_BASE}/companies/${encodeURIComponent(slug)}`, {
    fallbackData: initial.company ?? undefined,
  });
  const freshness = useSWR<DataFreshness>(`${API_BASE}/freshness`, {
    fallbackData: initial.freshness ?? undefined,
  });
  const liveStatus = useSWR<LiveStatus>(`${API_BASE}/live/status`, {
    fallbackData: initial.liveStatus ?? undefined,
  });
  const { data: peers = [] } = usePeers(slug);
  const { data: extras } = useCompanyExtras(slug);

  const isValidating = company.isValidating || freshness.isValidating || liveStatus.isValidating;
  const error = company.error ?? freshness.error ?? liveStatus.error;

  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const { push } = useToast();

  /** Harvest fresh data upstream, then re-read every SWR key used by this view. */
  async function refresh() {
    setSyncError(null);
    setSyncing(true);
    try {
      await syncLiveData();
      await Promise.all([company.mutate(), freshness.mutate(), liveStatus.mutate()]);
      push({ title: "Live data synced", description: "This company's figures are up to date.", tone: "success" });
    } catch (err) {
      const detail = messageOf(err);
      setSyncError(detail);
      push({ title: "Sync failed", description: detail, tone: "error" });
    } finally {
      setSyncing(false);
    }
  }

  if (company.error) {
    return (
      <ErrorState
        title="Company data unavailable"
        description={messageOf(company.error)}
        onRetry={() => void company.mutate()}
      />
    );
  }
  if (!company.data) return <CompanyDetailSkeleton />;

  const c = company.data;
  const profile = c.profile;
  const quote = c.quote;
  const annual = c.annual ?? [];
  const segments = c.segments ?? [];
  const riskFactors = c.riskFactors ?? [];
  const documents = c.documents ?? [];
  const provenance = c.provenance ?? null;
  const latest = annual.length ? annual[annual.length - 1] : null;
  const latestSegments = segments.length ? segments[segments.length - 1] : null;
  const positive = (quote?.changePct ?? 0) >= 0;
  const ChangeIcon = positive ? ArrowUpRight : ArrowDownRight;
  const yearRange =
    annual.length > 1
      ? `${annual[0].year} – ${annual[annual.length - 1].year}`
      : annual.length === 1
        ? annual[0].year
        : null;
  const citations = documents.filter((doc) => typeof doc.sourceUrl === "string" && doc.sourceUrl.length > 0);
  const currency = profile?.currency || "INR";
  const peerRows: PeerRow[] = [
    {
      slug: profile?.slug ?? slug,
      ticker: profile?.ticker ?? slug.toUpperCase(),
      name: profile?.name ?? slug,
      marketCap: quote?.marketCap ?? null,
      peRatio: quote?.peRatio ?? latest?.peRatio ?? null,
      roe: latest?.roe ?? null,
      margin: latest?.netMargin ?? null,
      revenueGrowth: latest?.revenueGrowth ?? null,
      returnYtd: quote?.changePct ?? null,
      current: true,
    },
    ...peers.filter((peer) => peer.slug !== (profile?.slug ?? slug)),
  ];
  const metricYears = annual.slice(-4).map((item) => item.year);
  const metricKeys = Array.from(new Set(annual.flatMap((item) => Object.keys(item.metrics ?? {})))).sort((a, b) =>
    a.localeCompare(b),
  );

  return (
    <div className="space-y-6">
      <section aria-labelledby="company-heading">
        <Card>
          <CardContent className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center">
            <CompanyLogo
              slug={slug}
              name={profile?.name ?? slug}
              website={profile?.website}
              size={64}
              className="rounded-2xl"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 id="company-heading" className="text-2xl font-bold">
                  {profile?.name || slug}
                </h1>
                {profile?.ticker && <Badge variant="secondary">{profile.ticker}</Badge>}
                {profile?.sector && <Badge variant="info">{profile.sector}</Badge>}
                {yearRange && <Badge variant="outline">{yearRange}</Badge>}
                <Badge variant={positive ? "success" : "destructive"} className="gap-1">
                  <ChangeIcon className="h-3 w-3" />
                  {formatOrDash(quote?.changePct, (n) => formatPercent(n))}
                </Badge>
                {isValidating && (
                  <Badge variant="outline" className="gap-1 text-muted-foreground">
                    <RefreshCw className="h-3 w-3 animate-spin" /> Syncing…
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {[profile?.industry, profile?.exchange, profile?.market].filter(Boolean).join(" · ")}
                {profile?.founded ? ` · Founded ${profile.founded}` : ""}
              </p>
              <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Last price</dt>
                  <dd className="mt-0.5 text-3xl font-bold tabular-nums">
                    {formatOrDash(quote?.price, (n) => formatNumber(n))}{" "}
                    <span className="text-sm font-normal text-muted-foreground">{currency}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Change</dt>
                  <dd
                    className={cn(
                      "mt-0.5 text-sm font-medium tabular-nums",
                      positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
                    )}
                  >
                    {formatOrDash(quote?.change, (n) => formatNumber(n))} (
                    {formatOrDash(quote?.changePct, (n) => formatPercent(n))})
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Day range</dt>
                  <dd className="mt-0.5 text-sm font-medium tabular-nums">
                    {formatOrDash(quote?.low, (n) => formatNumber(n))} –{" "}
                    {formatOrDash(quote?.high, (n) => formatNumber(n))}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">52-week range</dt>
                  <dd className="mt-0.5 text-sm font-medium tabular-nums">
                    {formatOrDash(quote?.low52Week, (n) => formatNumber(n))} –{" "}
                    {formatOrDash(quote?.high52Week, (n) => formatNumber(n))}
                  </dd>
                </div>
              </dl>
            </div>
          </CardContent>
        </Card>
      </section>

      <DataFreshnessPanel
        freshness={freshness.data ?? null}
        liveStatus={liveStatus.data ?? null}
        unavailable={provenance?.unavailable ?? []}
        mode={provenance?.mode}
        provenanceSources={provenance?.sources ?? []}
        provenanceAsOf={provenance?.asOf ?? null}
        isValidating={isValidating || syncing}
        error={syncError ?? (error ? messageOf(error) : null)}
        onRefresh={refresh}
      />

      <CompanyAiPanel
        slug={slug}
        name={profile.name ?? slug}
        ticker={profile.ticker ?? slug.toUpperCase()}
        annual={annual}
        quote={quote}
        peers={peers}
      />

      <section aria-labelledby="key-metrics-heading" className="space-y-3">
        <header>
          <h2 id="key-metrics-heading" className="text-base font-semibold">Key metrics</h2>
          <p className="text-xs text-muted-foreground">Reported values only — “—” means unsourced.</p>
        </header>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
          <MetricTile label="Market cap" value={formatOrDash(quote?.marketCap, (n) => formatLargeNumber(n))} />
          <MetricTile label="P/E ratio" value={formatOrDash(quote?.peRatio ?? latest?.peRatio, (n) => formatNumber(n))} />
          <MetricTile label="EPS" value={formatOrDash(quote?.eps ?? latest?.eps, (n) => formatNumber(n))} />
          <MetricTile
            label="Dividend yield"
            value={formatOrDash(quote?.dividendYield ?? latest?.dividendYield, (n) => formatPercent(n))}
          />
          <MetricTile label="ROE" value={formatOrDash(latest?.roe, (n) => formatPercent(n))} />
          <MetricTile label="ROCE" value={formatOrDash(latest?.roce, (n) => formatPercent(n))} />
          <MetricTile label="Revenue growth" value={formatOrDash(latest?.revenueGrowth, (n) => formatPercent(n))} />
          <MetricTile label="Free cash flow" value={formatOrDash(latest?.freeCashFlow, (n) => formatLargeNumber(n))} />
        </div>
      </section>

      <section aria-labelledby="ratios-heading" className="space-y-3">
        <header>
          <h2 id="ratios-heading" className="text-base font-semibold">Ratios &amp; returns</h2>
          <p className="text-xs text-muted-foreground">
            Latest reported year ({latest?.year ?? "—"}) from the company record. “—” means no sourced value.
          </p>
        </header>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <MetricTile label="P/E" value={formatOrDash(latest?.peRatio ?? quote?.peRatio, formatNumber)} />
          <MetricTile label="Price / book" value={formatOrDash(latest?.priceToBook, formatNumber)} />
          <MetricTile label="EV / EBITDA" value={formatOrDash(latest?.evToEbitda, formatNumber)} />
          <MetricTile label="Price / sales" value={formatOrDash(latest?.priceToSales, formatNumber)} />
          <MetricTile label="Net margin" value={formatOrDash(latest?.netMargin, formatPercent)} />
          <MetricTile label="Operating margin" value={formatOrDash(latest?.operatingMargin, formatPercent)} />
          <MetricTile label="EBITDA margin" value={formatOrDash(latest?.ebitdaMargin, formatPercent)} />
          <MetricTile label="ROE" value={formatOrDash(latest?.roe, formatPercent)} />
          <MetricTile label="ROCE" value={formatOrDash(latest?.roce, formatPercent)} />
          <MetricTile label="Return on assets" value={formatOrDash(latest?.returnOnAssets, formatPercent)} />
          <MetricTile label="Debt / equity" value={formatOrDash(latest?.debtToEquity, formatNumber)} />
          <MetricTile label="Current ratio" value={formatOrDash(latest?.currentRatio, formatNumber)} />
          <MetricTile label="Interest cover" value={formatOrDash(latest?.interestCover, formatNumber)} />
          <MetricTile label="Book value" value={formatOrDash(latest?.bookValue, formatNumber)} />
          <MetricTile label="Dividend / share" value={formatOrDash(latest?.dividendPerShare, formatNumber)} />
          <MetricTile label="Shares outstanding" value={formatOrDash(latest?.sharesOutstanding, formatLargeNumber)} />
        </div>
      </section>

      <section aria-labelledby="competition-heading">
        <Card>
          <CardHeader>
            <CardTitle id="competition-heading">Competition &amp; comparables</CardTitle>
            <CardDescription>
              Reported metrics for this company and other listed companies with a classification available from the
              same sources. Unavailable fields stay blank rather than estimated.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <DataTable
              rows={peerRows}
              columns={peerColumns}
              rowKey={(p) => `${p.slug}-${p.ticker}`}
              filename={`${slug}-comparables.csv`}
              initialSort={{ key: "marketCap", dir: "desc" }}
              emptyMessage="No comparable company records are available."
            />
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="company-intel-heading" className="grid gap-6 lg:grid-cols-2">
        <Card className="h-full">
          <CardHeader>
            <CardTitle id="company-intel-heading">Company background</CardTitle>
            <CardDescription>General reference from Wikipedia · not market data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {extras?.wikipedia?.imageUrl ? (
              <div
                className="h-32 w-full rounded-lg bg-cover bg-center"
                style={{ backgroundImage: `url("${extras.wikipedia.imageUrl}")` }}
                role="img"
                aria-label={`${extras.wikipedia.title} image`}
              />
            ) : null}
            <p className="text-sm leading-relaxed text-muted-foreground">
              {extras?.wikipedia?.extract ?? "No background is available from this source."}
            </p>
            {extras?.wikipedia?.url ? (
              <a
                href={extras.wikipedia.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Read the full article
              </a>
            ) : null}
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle>Official exchange filings</CardTitle>
            <CardDescription>Corporate announcements from NSE · links open the original filing</CardDescription>
          </CardHeader>
          <CardContent>
            {extras?.announcements?.length ? (
              <ul className="divide-y divide-border/60">
                {extras.announcements.slice(0, 6).map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-sm text-foreground hover:text-primary hover:underline"
                      >
                        {item.title}
                      </a>
                      <p className="text-[11px] text-muted-foreground">
                        {[item.publisher, item.publishedAt ? formatTimestamp(item.publishedAt) : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No announcements were returned by the exchange.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="annual-heading">
        <Card>
          <CardHeader>
            <CardTitle id="annual-heading">Annual financials</CardTitle>
            <CardDescription>Reported annual figures across the available fiscal years.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {annual.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No annual financials were reported by the backend.
              </p>
            ) : (
              <DataTable
                rows={annual}
                columns={annualColumns}
                rowKey={(a) => a.year}
                filename={`${slug}-annual-financials.csv`}
                initialSort={{ key: "year", dir: "desc" }}
                emptyMessage="No annual financials match this filter."
              />
            )}
          </CardContent>
        </Card>
      </section>

      {metricKeys.length > 0 ? (
        <section aria-labelledby="all-metrics-heading">
          <Card>
            <CardHeader>
              <CardTitle id="all-metrics-heading">All reported metrics</CardTitle>
              <CardDescription>
                Every numeric row published by the source for the latest available years. Values are in Rs crore
                unless the row label states a percentage, ratio or day count. “—” means the source did not report it.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Metric</th>
                    {metricYears.map((year) => (
                      <th key={year} className="py-2 pl-4 text-right font-medium">{year}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {metricKeys.map((key) => (
                    <tr key={key} className="border-b border-border/40 last:border-0">
                      <td className="py-2 pr-4 text-muted-foreground">{key}</td>
                      {metricYears.map((year) => {
                        const row = annual.find((item) => item.year === year);
                        return (
                          <td key={year} className="py-2 pl-4 text-right tabular-nums">
                            {formatOrDash(row?.metrics?.[key], (n) => formatNumber(n))}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="segments-heading">
          <Card className="h-full">
            <CardHeader>
              <CardTitle id="segments-heading">Business segments</CardTitle>
              <CardDescription>
                {latestSegments ? `Revenue mix for ${latestSegments.year}.` : "Reported revenue mix."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!latestSegments || !latestSegments.segments?.length ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Segment breakdown is not available from free public sources.
                </p>
              ) : (
                latestSegments.segments.map((s) => (
                  <div key={s.name} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium">{s.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatOrDash(s.revenue, (n) => formatLargeNumber(n))} ·{" "}
                        {formatOrDash(s.share, (n) => formatPercent(n))}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(0, Math.min(100, s.share ?? 0))}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="citations-heading">
          <Card className="h-full">
            <CardHeader>
              <CardTitle id="citations-heading">Citations &amp; sources</CardTitle>
              <CardDescription>Original documents behind the reported figures.</CardDescription>
            </CardHeader>
            <CardContent>
              {citations.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No source documents were supplied with this profile.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {citations.map((doc) => (
                    <li key={doc.id}>
                      <a
                        href={doc.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-xs transition-colors hover:border-primary/40"
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span>{doc.title}</span>
                        {doc.source && <span className="text-muted-foreground">· {doc.source}</span>}
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <section aria-labelledby="risks-heading">
        <Card>
          <CardHeader>
            <CardTitle id="risks-heading" className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-primary" /> Risks &amp; cons
            </CardTitle>
            <CardDescription>Disclosed risk points and drawbacks from the source.</CardDescription>
          </CardHeader>
          <CardContent>
            {riskFactors.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No risk factors were reported by the source.
              </p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-3">
                {riskFactors.map((r, i) => (
                  <li key={`${r.title}-${i}`} className="rounded-xl border border-border/60 bg-muted/30 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">{r.title}</h3>
                      <Badge
                        variant={
                          r.severity === "high" ? "destructive" : r.severity === "medium" ? "warning" : "info"
                        }
                      >
                        {r.severity}
                      </Badge>
                    </div>
                    {r.description && (
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{r.description}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="md-heading">
        <Card>
          <CardHeader>
            <CardTitle id="md-heading">Management discussion &amp; analysis</CardTitle>
            {provenance?.asOf && (
              <CardDescription>
                As of <time dateTime={provenance.asOf}>{formatTimestamp(provenance.asOf)}</time>
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {c.managementDiscussion ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {c.managementDiscussion}
              </p>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No management discussion was provided by the source.
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <dl>
          <dt className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
          <dd className="mt-1 truncate text-lg font-semibold tabular-nums">{value}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}
