"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { EChartsCoreOption } from "echarts/core";
import { useCompany, usePeerGroup, useValuation } from "@/lib/api";
import { EChart } from "@/components/charts/echart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonCard } from "@/components/ui/loader";
import { ErrorState } from "@/components/ui/error-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { colorFromSlug } from "@/data/account";
import { formatCurrency, formatLargeNumber, formatNumber, formatOrDash, formatPercent } from "@/lib/utils";

export function CompanyOverview({ slug }: { slug: string }) {
  const { data: company, isLoading, isError } = useCompany(slug);
  const { data: peers, isLoading: peersLoading } = usePeerGroup(slug);
  const { data: valuation, isLoading: valuationLoading } = useValuation(slug);

  const chartOption = useMemo<EChartsCoreOption | null>(() => {
    if (!valuation?.length) return null;
    const accent = company?.profile.accent ?? colorFromSlug(slug);
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", valueFormatter: (v: number) => formatCurrency(Number(v)) },
      grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: valuation.map((v) => v.year),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: "#94a3b8", fontSize: 11 },
      },
      yAxis: {
        type: "value",
        scale: true,
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.15)" } },
        axisLabel: { color: "#94a3b8", fontSize: 11 },
      },
      series: [
        {
          name: "Share price",
          type: "line",
          data: valuation.map((v) => v.price),
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 3, color: accent },
          areaStyle: {
            color: {
              type: "linear",
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: `${accent}66` },
                { offset: 1, color: `${accent}00` },
              ],
            },
          },
        },
      ],
    };
  }, [valuation, company?.profile.accent, slug]);

  if (isLoading || !company) return <OverviewSkeleton />;
  if (isError) return <ErrorState title="Company unavailable" description="We couldn't load this company's profile." />;

  const { profile, quote, annual, segments, riskFactors, managementDiscussion } = company;
  const accent = profile.accent ?? colorFromSlug(slug);
  const latest = annual[annual.length - 1];
  const lastSegments = segments[segments.length - 1];
  const positive = quote.changePct >= 0;
  const ChangeIcon = positive ? TrendingUp : TrendingDown;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="space-y-6"
    >
      <Card>
        <CardContent className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center">
          <span
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-2xl font-black"
            style={{ background: `${accent}22`, color: accent }}
          >
            {profile.ticker.slice(0, 2)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{profile.name}</h1>
              <Badge variant="secondary">{profile.ticker}</Badge>
              <Badge variant="info">{profile.sector}</Badge>
              <Badge variant={positive ? "success" : "destructive"}>
                <ChangeIcon className="h-3 w-3" />
                {formatPercent(quote.changePct)}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {profile.industry} · {profile.exchange} · {profile.market} · Founded {profile.founded}
            </p>
            <div className="mt-3 flex flex-wrap items-baseline gap-4">
              <span className="text-3xl font-bold tabular-nums">{formatCurrency(quote.price)}</span>
              <span className={`text-sm font-medium tabular-nums ${positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {positive ? "+" : ""}{formatCurrency(quote.change)} ({formatPercent(quote.changePct)})
              </span>
              <span className="text-xs text-muted-foreground">
                52-week: {formatCurrency(quote.high52Week)} / {formatCurrency(quote.low52Week)}
              </span>
            </div>
          </div>
          <div className="grid shrink-0 grid-cols-3 gap-3 text-center">
            <MiniStat label="Open" value={formatOrDash(quote.open, (n) => formatCurrency(n))} />
            <MiniStat label="High" value={formatCurrency(quote.high)} />
            <MiniStat label="Low" value={formatCurrency(quote.low)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Price history</CardTitle>
          <CardDescription>Year-end share price across fiscal years.</CardDescription>
        </CardHeader>
        <CardContent>
          {valuationLoading || !chartOption ? <Skeleton className="h-72 w-full" /> : <EChart option={chartOption} height={300} />}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        <Stat label="Market cap" value={formatLargeNumber(quote.marketCap)} />
        <Stat label="P/E ratio" value={formatOrDash(latest.peRatio, (n) => formatNumber(n))} />
        <Stat label="EPS" value={formatOrDash(latest.eps, (n) => formatCurrency(n))} />
        <Stat label="Dividend yield" value={formatOrDash(latest.dividendYield, (n) => formatPercent(n))} />
        <Stat label="ROE" value={formatOrDash(latest.roe, (n) => formatPercent(n))} />
        <Stat label="ROCE" value={formatOrDash(latest.roce, (n) => formatPercent(n))} />
        <Stat label="Revenue growth" value={formatOrDash(latest.revenueGrowth, (n) => formatPercent(n))} />
        <Stat label="Free cash flow" value={formatOrDash(latest.freeCashFlow, (n) => formatLargeNumber(n))} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Peer comparison</CardTitle>
            <CardDescription>Same-sector peers ranked by market cap.</CardDescription>
          </CardHeader>
          <CardContent>
            {peersLoading || !peers ? (
              <Skeleton className="h-64 w-full" />
            ) : peers.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No peers available for this company.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Peer</TableHead>
                    <TableHead className="text-right">Mkt cap</TableHead>
                    <TableHead className="text-right">P/E</TableHead>
                    <TableHead className="text-right">ROE</TableHead>
                    <TableHead className="text-right">Rev growth</TableHead>
                    <TableHead className="text-right">YTD</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {peers.map((p) => (
                    <TableRow key={p.ticker}>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.ticker}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatOrDash(p.marketCap, formatLargeNumber)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatOrDash(p.peRatio, formatNumber)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatOrDash(p.roe, formatPercent)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatOrDash(p.revenueGrowth, formatPercent)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${(p.returnYtd ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        {formatOrDash(p.returnYtd, formatPercent)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Business segments</CardTitle>
            <CardDescription>Revenue mix for {lastSegments?.year ?? "latest year"}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {lastSegments?.segments.map((s) => (
              <div key={s.name} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{s.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatLargeNumber(s.revenue)} · {formatPercent(s.share)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${s.share}%`, background: accent }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Risk factors</CardTitle>
          <CardDescription>Key risks identified from filings and disclosure.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {riskFactors.map((r) => (
            <div key={r.title} className="rounded-xl border border-border/60 bg-muted/30 p-4">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">{r.title}</h4>
                <Badge variant={r.severity === "high" ? "destructive" : r.severity === "medium" ? "warning" : "info"}>
                  {r.severity}
                </Badge>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{r.description}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Management discussion & analysis</CardTitle>
          <CardDescription>FY2026 performance commentary.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">{managementDiscussion}</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 truncate text-lg font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonCard className="h-40" />
      <SkeletonCard className="h-80" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} className="h-24" />)}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <SkeletonCard className="h-72" />
        <SkeletonCard className="h-72" />
      </div>
      <SkeletonCard className="h-48" />
    </div>
  );
}