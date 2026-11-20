"use client";

import { useMemo } from "react";
import { Building2, CalendarRange } from "lucide-react";
import { useCompany } from "@/lib/api";
import { buildMetricView, type MetricKey } from "@/lib/metrics";
import { EChart } from "@/components/charts/echart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SkeletonCard } from "@/components/ui/loader";
import { ErrorState } from "@/components/ui/error-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { colorFromSlug } from "@/data/account";

export function FinancialsPage({ slug, metric }: { slug: string; metric: MetricKey }) {
  const { data: company, isLoading, isError } = useCompany(slug);
  const view = useMemo(() => (company ? buildMetricView(metric, company) : null), [company, metric]);

  if (isLoading || !company || !view) return <FinancialsSkeleton />;
  if (isError) return <ErrorState title="Company unavailable" />;

  const c = company.profile;
  const dd = view.rows[view.rows.length - 1];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Header name={c.name} ticker={c.ticker} slug={c.slug} sector={c.sector} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {view.stats.map((s, i) => {
          const latest = s.accessor(dd);
          return (
            <Card key={i}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="mt-1 truncate text-xl font-semibold tabular-nums">{s.format(latest)}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle>{view.meta.title}</CardTitle>
            <CardDescription>{view.meta.description}</CardDescription>
          </div>
          <Badge variant="outline" className="gap-1"><CalendarRange className="h-3 w-3" /> FY2018 – FY2026</Badge>
        </CardHeader>
        <CardContent>
          <EChart option={view.option} height={360} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Annual detail</CardTitle>
          <CardDescription>Year-wise figures across the period.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                {view.table.map((col) => <TableHead key={col.label}>{col.label}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{view.years[i]}</TableCell>
                  {view.table.map((col) => <TableCell key={col.label}>{col.accessor(r)}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function FinancialsSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonCard className="h-16" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><SkeletonCard className="h-24" /><SkeletonCard className="h-24" /><SkeletonCard className="h-24" /><SkeletonCard className="h-24" /></div>
      <SkeletonCard className="h-96" />
    </div>
  );
}

function Header({ name, ticker, slug, sector }: { name: string; ticker: string; slug: string; sector: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${colorFromSlug(slug)}22` }}>
        <Building2 className="h-5 w-5" style={{ color: colorFromSlug(slug) }} />
      </span>
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold">{name}<Badge variant="secondary">{ticker}</Badge></h1>
        <p className="text-xs text-muted-foreground">{sector}</p>
      </div>
    </div>
  );
}