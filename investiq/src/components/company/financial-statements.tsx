"use client";

import { useMemo } from "react";
import type { AnnualFinancials } from "@/lib/types";
import { useFinancials } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SkeletonCard } from "@/components/ui/loader";
import { ErrorState } from "@/components/ui/error-state";
import { formatLargeNumber, formatNumber, formatPercent } from "@/lib/utils";

interface Row {
  label: string;
  access: (a: AnnualFinancials) => string;
}

const money = (v: number | null) => (v == null ? "—" : formatLargeNumber(v));
const ratio = (v: number | null) => (v == null ? "—" : formatNumber(v, 2));
const pct = (v: number | null) => (v == null ? "—" : formatPercent(v, 1));

const INCOME: Row[] = [
  { label: "Revenue", access: (a) => money(a.revenue) },
  { label: "Gross profit", access: (a) => money(a.grossProfit) },
  { label: "Operating income", access: (a) => money(a.operatingIncome) },
  { label: "EBITDA", access: (a) => money(a.ebitda) },
  { label: "Net income", access: (a) => money(a.netIncome) },
  { label: "EPS", access: (a) => ratio(a.eps) },
];

const BALANCE: Row[] = [
  { label: "Total assets", access: (a) => money(a.totalAssets) },
  { label: "Total equity", access: (a) => money(a.totalEquity) },
  { label: "Total debt", access: (a) => money(a.totalDebt) },
  { label: "Net debt", access: (a) => money(a.netDebt) },
  { label: "Cash & equivalents", access: (a) => money(a.cash) },
  { label: "Book value", access: (a) => money(a.bookValue) },
  { label: "Current ratio", access: (a) => ratio(a.currentRatio) },
  { label: "Debt-to-equity", access: (a) => ratio(a.debtToEquity) },
];

const CASHFLOW: Row[] = [
  { label: "Operating cash flow", access: (a) => money(a.operatingCashFlow) },
  { label: "Investing cash flow", access: (a) => money(a.investingCashFlow) },
  { label: "Financing cash flow", access: (a) => money(a.financingCashFlow) },
  { label: "Free cash flow", access: (a) => money(a.freeCashFlow) },
  { label: "Capital expenditure", access: (a) => money(a.capex) },
];

const RATIOS: Row[] = [
  { label: "Gross margin", access: (a) => pct(a.grossMargin) },
  { label: "Operating margin", access: (a) => pct(a.operatingMargin) },
  { label: "Net margin", access: (a) => pct(a.netMargin) },
  { label: "EBITDA margin", access: (a) => pct(a.ebitdaMargin) },
  { label: "ROE", access: (a) => pct(a.roe) },
  { label: "ROCE", access: (a) => pct(a.roce) },
  { label: "Return on assets", access: (a) => pct(a.returnOnAssets) },
  { label: "Interest cover", access: (a) => ratio(a.interestCover) },
];

export function FinancialStatements({ slug }: { slug: string }) {
  const { data: annual, isLoading, isError } = useFinancials(slug);

  const statement = useMemo(() => {
    if (!annual?.length) return null;
    return {
      income: INCOME,
      balance: BALANCE,
      cashflow: CASHFLOW,
      ratios: RATIOS,
    };
  }, [annual]);

  if (isLoading || !annual || !statement) return <SkeletonTables />;
  if (isError) return <ErrorState title="Financial data unavailable" />;

  const years = annual.map((a) => a.year);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Consolidated financial statements</CardTitle>
        <CardDescription>Annual figures across all reported fiscal years.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="income" className="space-y-4">
          <TabsList>
            <TabsTrigger value="income">Income statement</TabsTrigger>
            <TabsTrigger value="balance">Balance sheet</TabsTrigger>
            <TabsTrigger value="cashflow">Cash flow</TabsTrigger>
            <TabsTrigger value="ratios">Ratios</TabsTrigger>
          </TabsList>
          <TabsContent value="income">
            <StatementTable years={years} annual={annual} rows={statement.income} />
          </TabsContent>
          <TabsContent value="balance">
            <StatementTable years={years} annual={annual} rows={statement.balance} />
          </TabsContent>
          <TabsContent value="cashflow">
            <StatementTable years={years} annual={annual} rows={statement.cashflow} />
          </TabsContent>
          <TabsContent value="ratios">
            <StatementTable years={years} annual={annual} rows={statement.ratios} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function StatementTable({ years, annual, rows }: { years: string[]; annual: AnnualFinancials[]; rows: Row[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Metric</TableHead>
          {years.map((y) => (
            <TableHead key={y} className="text-right">{y}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.label}>
            <TableCell className="font-medium">{r.label}</TableCell>
            {annual.map((a) => (
              <TableCell key={a.year} className="text-right tabular-nums">{r.access(a)}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SkeletonTables() {
  return (
    <div className="space-y-4">
      <SkeletonCard className="h-12 w-full" />
      <SkeletonCard className="h-96" />
    </div>
  );
}