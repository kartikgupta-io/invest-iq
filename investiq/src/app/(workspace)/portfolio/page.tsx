"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Briefcase, Plus, TrendingUp, Wallet, ChartPie as PieIcon } from "lucide-react";
import { useCompanies, useHoldings } from "@/lib/api";
import { buildPortfolioMetrics, colorFromSlug } from "@/data/account";
import { usePortfolioStore } from "@/store";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";
import type { EChartsCoreOption } from "echarts/core";
import { EChart } from "@/components/charts/echart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function PortfolioPage() {
  const { data: holdings } = useHoldings();
  const { data: companies = [] } = useCompanies();
  const setHoldings = usePortfolioStore((s) => s.setHoldings);
  const stored = usePortfolioStore((s) => s.holdings);
  const { push } = useToast();
  const [open, setOpen] = useState(false);

  // Allocation and current price are derived from live quotes, not fixtures.
  const liveHoldings = useMemo(() => {
    const total = (holdings ?? []).reduce((sum, h) => sum + h.quantity * h.currentPrice, 0);
    return (holdings ?? []).map((h) => ({
      ...h,
      allocationPct: total > 0 ? (h.quantity * h.currentPrice * 100) / total : 0,
    }));
  }, [holdings]);

  const metrics = useMemo(() => buildPortfolioMetrics(liveHoldings), [liveHoldings]);

  const donutOption = useMemo<EChartsCoreOption | null>(() => {
    if (!liveHoldings.length) return null;
    return {
      tooltip: { trigger: "item", formatter: "{b}: {c}%" },
      legend: { orient: "vertical", right: 8, top: "center", textStyle: { color: "#94a3b8" } },
      series: [{
        name: "Allocation",
        type: "pie",
        radius: ["55%", "80%"],
        center: ["35%", "50%"],
        avoidLabelOverlap: true,
        label: { show: false },
        data: liveHoldings.map((h) => ({
          name: h.ticker,
          value: Number(h.allocationPct.toFixed(1)),
          itemStyle: { color: colorFromSlug(h.slug) },
        })),
      }],
    };
  }, [liveHoldings]);

  function addHolding(holding: (typeof liveHoldings)[number]) {
    setHoldings([...stored, holding]);
    setOpen(false);
    push({ title: "Holding added", description: `${holding.ticker} is now in your local portfolio.`, tone: "success" });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        eyebrow="Workspace"
        title="Portfolio"
        description="Positions you add locally, priced with live quotes — nothing is seeded or invented."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4" /> Add holding</Button>
            </DialogTrigger>
            <AddHoldingDialog companies={companies} onAdd={addHolding} onCancel={() => setOpen(false)} />
          </Dialog>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={<Wallet className="h-4 w-4" />} label="Total value" value={formatCurrency(metrics.totalValue)} />
        <StatTile icon={<Briefcase className="h-4 w-4" />} label="Invested" value={formatCurrency(metrics.totalInvested)} />
        <StatTile
          icon={<TrendingUp className="h-4 w-4" />}
          label="Unrealised P&L"
          value={formatCurrency(metrics.profit)}
          accent={metrics.profit >= 0 ? "positive" : "negative"}
        />
        <StatTile
          icon={<PieIcon className="h-4 w-4" />}
          label="Return"
          value={formatPercent(metrics.returnPct)}
          accent={metrics.returnPct >= 0 ? "positive" : "negative"}
        />
      </div>

      {liveHoldings.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="h-7 w-7" />}
          title="Your portfolio is empty"
          description="Add a holding to track allocation and unrealised performance using live market prices."
          action={<Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add your first holding</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold">Holdings</h2>
              <Badge variant="outline">{liveHoldings.length} positions</Badge>
            </div>
            <div className="glass-panel overflow-hidden rounded-2xl">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Avg price</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">Day</TableHead>
                    <TableHead className="w-36">Allocation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {liveHoldings.map((h) => (
                    <TableRow key={h.slug}>
                      <TableCell>
                        <Link href={`/company/${h.slug}`} className="flex items-center gap-2.5">
                          <span className="h-2 w-2 rounded-full" style={{ background: colorFromSlug(h.slug) }} />
                          <span>
                            <span className="block font-medium">{h.ticker}</span>
                            <span className="block text-xs text-muted-foreground">{h.name}</span>
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(h.quantity, 0)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(h.avgPrice, "₹")}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatCurrency(h.currentPrice, "₹")}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={h.dayChangePct >= 0 ? "success" : "destructive"}>
                          {formatPercent(h.dayChangePct)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{h.allocationPct.toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-4">
            <h2 className="font-display mb-3 text-base font-semibold">Allocation</h2>
            {donutOption ? <EChart option={donutOption} height={280} /> : null}
          </div>
        </div>
      )}
    </div>
  );
}

function AddHoldingDialog({
  companies,
  onAdd,
  onCancel,
}: {
  companies: { slug: string; ticker: string; name: string; price: number | null }[];
  onAdd: (holding: {
    slug: string; ticker: string; name: string; quantity: number; avgPrice: number;
    currentPrice: number; dayChangePct: number; allocationPct: number;
  }) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<(typeof companies)[number] | null>(null);
  const [quantity, setQuantity] = useState("");
  const [avgPrice, setAvgPrice] = useState("");

  const matches = companies
    .filter((c) => `${c.name} ${c.ticker}`.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 6);

  const valid = selected && Number(quantity) > 0 && Number(avgPrice) > 0;

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add a holding</DialogTitle>
        <DialogDescription>Stored in this browser only. Current price comes from the live feed.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="holding-company">Company</Label>
          <Input
            id="holding-company"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(null);
            }}
            placeholder="Search by name or ticker"
          />
          {query && !selected ? (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-1">
              {matches.map((company) => (
                <button
                  key={company.slug}
                  type="button"
                  onClick={() => {
                    setSelected(company);
                    setQuery(`${company.name} (${company.ticker})`);
                    setAvgPrice(company.price ? String(company.price) : "");
                  }}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <span className="truncate">{company.name}</span>
                  <span className="text-xs text-muted-foreground">{company.ticker}</span>
                </button>
              ))}
              {matches.length === 0 ? <p className="p-2 text-xs text-muted-foreground">No matching company in coverage.</p> : null}
            </div>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="holding-qty">Quantity</Label>
            <Input id="holding-qty" type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="holding-avg">Avg price (₹)</Label>
            <Input id="holding-avg" type="number" min="0" step="0.01" value={avgPrice} onChange={(event) => setAvgPrice(event.target.value)} />
          </div>
        </div>
      </div>
      <DialogFooter>
        <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
        <Button
          disabled={!valid}
          onClick={() => {
            if (!selected || !valid) return;
            onAdd({
              slug: selected.slug,
              ticker: selected.ticker,
              name: selected.name,
              quantity: Number(quantity),
              avgPrice: Number(avgPrice),
              currentPrice: selected.price ?? Number(avgPrice),
              dayChangePct: 0,
              allocationPct: 0,
            });
          }}
        >
          Save holding
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
