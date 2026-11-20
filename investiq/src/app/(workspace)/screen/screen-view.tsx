"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import useSWR from "swr";
import {
  Bell,
  BellPlus,
  CircleAlert,
  Loader2,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { API_BASE } from "@/lib/swr";
import type { CompanySummary, DataFreshness } from "@/lib/types";
import {
  DEFAULT_FILTERS,
  getWorkspace,
  isGuest,
  uid,
  updateWorkspace,
  type PriceAlert,
  type SavedScreen,
  type ScreenFilters,
  type WorkspaceData,
} from "@/lib/workspace";
import {
  cn,
  formatLargeNumber,
  formatNumber,
  formatOrDash,
  formatPercent,
  formatTimestamp,
} from "@/lib/utils";

const KEYS = {
  companies: `${API_BASE}/companies`,
  freshness: `${API_BASE}/freshness`,
};

/** Market caps are entered in ₹ crore; the live feed stores absolute rupees. */
const CRORE = 1e7;

/**
 * localStorage-backed workspace store. useSyncExternalStore keeps the cached
 * snapshot referentially stable and hydration-safe (server snapshot is empty).
 * Writes go through updateWorkspace so guest and signed-in storage both work.
 */
type WorkspaceSnapshot = {
  screens: SavedScreen[];
  alerts: PriceAlert[];
  guest: boolean;
};

const EMPTY_SNAPSHOT: WorkspaceSnapshot = { screens: [], alerts: [], guest: true };
let workspaceCache: WorkspaceSnapshot | null = null;
const workspaceListeners = new Set<() => void>();

function readWorkspaceSnapshot(): WorkspaceSnapshot {
  if (workspaceCache === null) {
    const workspace = getWorkspace();
    workspaceCache = { screens: workspace.screens, alerts: workspace.alerts, guest: isGuest() };
  }
  return workspaceCache;
}

function commitWorkspace(patch: Partial<WorkspaceData>): void {
  const next = updateWorkspace(patch);
  workspaceCache = { screens: next.screens, alerts: next.alerts, guest: isGuest() };
  workspaceListeners.forEach((listener) => listener());
}

function subscribeWorkspace(listener: () => void): () => void {
  workspaceListeners.add(listener);
  function onStorage(event: StorageEvent) {
    if (
      event.key?.startsWith("investiq-workspace:") ||
      event.key?.startsWith("investiq-active-user")
    ) {
      workspaceCache = null;
      workspaceListeners.forEach((cb) => cb());
    }
  }
  window.addEventListener("storage", onStorage);
  return () => {
    workspaceListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getWorkspaceSnapshot(): WorkspaceSnapshot {
  return readWorkspaceSnapshot();
}

function getServerWorkspaceSnapshot(): WorkspaceSnapshot {
  return EMPTY_SNAPSHOT;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return error ? String(error) : "The live service did not respond.";
}

function toNumber(raw: string): number | null {
  if (raw.trim() === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function ScreenView({
  initial,
}: {
  initial: { companies?: CompanySummary[] | null; freshness?: DataFreshness | null };
}) {
  const [filters, setFilters] = useState<ScreenFilters>({ ...DEFAULT_FILTERS });
  const [viewName, setViewName] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const workspace = useSyncExternalStore(
    subscribeWorkspace,
    getWorkspaceSnapshot,
    getServerWorkspaceSnapshot,
  );
  const savedScreens = workspace.screens;
  const alerts = workspace.alerts;
  const guest = workspace.guest;

  const companiesQuery = useSWR<CompanySummary[]>(KEYS.companies, {
    fallbackData: initial.companies ?? undefined,
  });
  const freshness = useSWR<DataFreshness>(KEYS.freshness, {
    fallbackData: initial.freshness ?? undefined,
  });
  const companies = useMemo(() => companiesQuery.data ?? [], [companiesQuery.data]);
  const isLoading = companiesQuery.isLoading;
  const isValidating = companiesQuery.isValidating || freshness.isValidating;
  const error = companiesQuery.error;

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const sectors = useMemo(() => {
    const unique = new Set<string>();
    for (const company of companies) {
      if (company.sector) unique.add(company.sector);
    }
    return [...unique].sort((a, b) => a.localeCompare(b));
  }, [companies]);

  const results = useMemo(() => {
    const term = filters.query.trim().toLowerCase();
    return companies.filter((company) => {
      if (filters.sector !== "all" && company.sector !== filters.sector) return false;
      if (
        term &&
        !`${company.name} ${company.ticker} ${company.sector} ${company.exchange}`
          .toLowerCase()
          .includes(term)
      ) {
        return false;
      }
      if (filters.minMarketCap != null && company.marketCap < filters.minMarketCap * CRORE) {
        return false;
      }
      if (filters.maxPe != null && (company.peRatio == null || company.peRatio > filters.maxPe)) {
        return false;
      }
      if (filters.minRoe != null && (company.roe == null || company.roe < filters.minRoe)) {
        return false;
      }
      if (
        filters.minGrowth != null &&
        (company.revenueGrowth == null || company.revenueGrowth < filters.minGrowth)
      ) {
        return false;
      }
      if (filters.direction === "gainers" && !(company.changePct > 0)) return false;
      if (filters.direction === "losers" && !(company.changePct < 0)) return false;
      return true;
    });
  }, [companies, filters]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.sector !== "all") count += 1;
    if (filters.query.trim()) count += 1;
    if (filters.minMarketCap != null) count += 1;
    if (filters.maxPe != null) count += 1;
    if (filters.minRoe != null) count += 1;
    if (filters.minGrowth != null) count += 1;
    if (filters.direction !== "any") count += 1;
    return count;
  }, [filters]);

  const addAlert = useCallback(
    (company: CompanySummary) => {
      if (
        alerts.some(
          (alert) =>
            alert.slug === company.slug &&
            alert.direction === "above" &&
            alert.target === company.price &&
            !alert.triggeredAt,
        )
      ) {
        setToast(`Alert already set for ${company.ticker}.`);
        return;
      }
      const alert: PriceAlert = {
        id: uid("alert"),
        slug: company.slug,
        ticker: company.ticker,
        name: company.name,
        direction: "above",
        target: company.price,
        createdAt: new Date().toISOString(),
      };
      const next = [alert, ...alerts];
      commitWorkspace({ alerts: next });
      setToast(`Alert armed: ${company.ticker} above ${formatNumber(company.price)}.`);
    },
    [alerts],
  );

  const columns = useMemo<DataTableColumn<CompanySummary>[]>(
    () => [
      {
        key: "name",
        label: "Company",
        value: (company) => company.name,
        render: (company) => (
          <>
            <Link href={`/company/${company.slug}`} className="font-medium hover:text-primary hover:underline">
              {company.name}
            </Link>
            <div className="text-xs text-muted-foreground">
              {company.ticker} · {company.sector} · {company.exchange}
            </div>
          </>
        ),
      },
      {
        key: "price",
        label: "Price",
        align: "right",
        value: (company) => company.price,
        render: (company) => <span className="tabular-nums">{formatOrDash(company.price, formatNumber)}</span>,
      },
      {
        key: "changePct",
        label: "Change %",
        align: "right",
        value: (company) => company.changePct,
        render: (company) => (
          <Badge
            variant={
              company.changePct == null
                ? "outline"
                : company.changePct >= 0
                  ? "success"
                  : "destructive"
            }
            className="tabular-nums"
          >
            {formatOrDash(company.changePct, formatPercent)}
          </Badge>
        ),
      },
      {
        key: "marketCap",
        label: "Market cap (₹ Cr)",
        align: "right",
        value: (company) => company.marketCap,
        render: (company) => (
          <span className="tabular-nums">{formatOrDash(company.marketCap, formatLargeNumber)}</span>
        ),
      },
      {
        key: "peRatio",
        label: "P/E",
        align: "right",
        value: (company) => company.peRatio,
        render: (company) => <span className="tabular-nums">{formatOrDash(company.peRatio, formatNumber)}</span>,
      },
      {
        key: "roe",
        label: "ROE %",
        align: "right",
        value: (company) => company.roe,
        render: (company) => <span className="tabular-nums">{formatOrDash(company.roe, formatPercent)}</span>,
      },
      {
        key: "revenueGrowth",
        label: "Rev growth %",
        align: "right",
        value: (company) => company.revenueGrowth,
        render: (company) => (
          <span className="tabular-nums">{formatOrDash(company.revenueGrowth, formatPercent)}</span>
        ),
      },
      {
        key: "alert",
        label: "Alert",
        align: "right",
        value: () => "",
        render: (company) => (
          <Button
            variant="soft"
            size="sm"
            onClick={() => addAlert(company)}
            title={`Alert when ${company.ticker} rises above ${formatNumber(company.price)}`}
          >
            <BellPlus className="h-3.5 w-3.5" /> Alert
          </Button>
        ),
      },
    ],
    [addAlert],
  );

  function clearFilters() {
    setFilters({ ...DEFAULT_FILTERS });
    setToast("Filters cleared.");
  }

  function refresh() {
    void companiesQuery.mutate();
    void freshness.mutate();
  }

  function saveView() {
    const name = viewName.trim();
    if (!name) {
      setToast("Give the view a name before saving.");
      return;
    }
    const screen: SavedScreen = {
      id: uid("screen"),
      name,
      filters: { ...filters },
      createdAt: new Date().toISOString(),
    };
    const next = [...savedScreens, screen];
    commitWorkspace({ screens: next });
    setViewName("");
    setToast(`Saved view “${name}”.`);
  }

  function applyView(screen: SavedScreen) {
    setFilters({ ...DEFAULT_FILTERS, ...screen.filters });
    setToast(`Applied “${screen.name}”.`);
  }

  function deleteView(id: string) {
    const next = savedScreens.filter((screen) => screen.id !== id);
    commitWorkspace({ screens: next });
    setToast("Saved view deleted.");
  }

  const asOf = freshness.data?.asOf;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Research terminal
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Company screener</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Filter the live coverage universe on valuation, profitability and momentum. Every figure
            below comes from the backend feed — nothing is estimated here.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {asOf ? (
            <Badge variant="outline" className="tabular-nums">
              Data as of {formatTimestamp(asOf)}
            </Badge>
          ) : (
            <Badge variant="outline">Freshness unavailable</Badge>
          )}
          <Button variant="outline" size="sm" onClick={refresh} disabled={isValidating}>
            <RefreshCw className={cn(isValidating && "animate-spin")} /> Refresh
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2 text-lg">
                <SlidersHorizontal className="h-4 w-4 text-primary" /> Filters
              </CardTitle>
              <CardDescription>Changes apply instantly to the live company list.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={clearFilters} disabled={activeFilterCount === 0}>
              <X className="h-3.5 w-3.5" /> Sweep filters
              {activeFilterCount > 0 ? (
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 tabular-nums">
                  {activeFilterCount}
                </Badge>
              ) : null}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Sector</span>
              <Select value={filters.sector} onValueChange={(value) => setFilters((f) => ({ ...f, sector: value }))}>
                <SelectTrigger aria-label="Sector">
                  <SelectValue placeholder="All sectors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sectors</SelectItem>
                  {sectors.map((sector) => (
                    <SelectItem key={sector} value={sector}>
                      {sector}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Search name or ticker</span>
              <Input
                value={filters.query}
                onChange={(event) => setFilters((f) => ({ ...f, query: event.target.value }))}
                placeholder="e.g. Reliance, TCS…"
                aria-label="Search name or ticker"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Min market cap (₹ Cr)</span>
              <Input
                type="number"
                min={0}
                step="any"
                value={filters.minMarketCap ?? ""}
                onChange={(event) => setFilters((f) => ({ ...f, minMarketCap: toNumber(event.target.value) }))}
                placeholder="Any"
                aria-label="Minimum market cap in crore rupees"
                className="tabular-nums"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Max P/E</span>
              <Input
                type="number"
                min={0}
                step="any"
                value={filters.maxPe ?? ""}
                onChange={(event) => setFilters((f) => ({ ...f, maxPe: toNumber(event.target.value) }))}
                placeholder="Any"
                aria-label="Maximum price to earnings ratio"
                className="tabular-nums"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Min ROE %</span>
              <Input
                type="number"
                step="any"
                value={filters.minRoe ?? ""}
                onChange={(event) => setFilters((f) => ({ ...f, minRoe: toNumber(event.target.value) }))}
                placeholder="Any"
                aria-label="Minimum return on equity percent"
                className="tabular-nums"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Min revenue growth %</span>
              <Input
                type="number"
                step="any"
                value={filters.minGrowth ?? ""}
                onChange={(event) => setFilters((f) => ({ ...f, minGrowth: toNumber(event.target.value) }))}
                placeholder="Any"
                aria-label="Minimum revenue growth percent"
                className="tabular-nums"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Direction</span>
              <Select
                value={filters.direction}
                onValueChange={(value) =>
                  setFilters((f) => ({ ...f, direction: value as ScreenFilters["direction"] }))
                }
              >
                <SelectTrigger aria-label="Direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any direction</SelectItem>
                  <SelectItem value="gainers">Gainers</SelectItem>
                  <SelectItem value="losers">Losers</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-lg">Results</CardTitle>
            <CardDescription className="tabular-nums">
              {isLoading
                ? "Loading the live coverage universe…"
                : `${results.length} of ${companies.length} companies match the current filters.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-10 text-center">
                <CircleAlert className="h-6 w-6 text-destructive" />
                <p className="text-sm font-medium">Could not load live companies</p>
                <p className="max-w-md text-xs text-muted-foreground">{messageOf(error)}</p>
                <Button variant="outline" size="sm" onClick={refresh}>
                  <RefreshCw className="h-3.5 w-3.5" /> Try again
                </Button>
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" /> Fetching live data…
              </div>
            ) : (
              <DataTable
                rows={results}
                columns={columns}
                rowKey={(company) => company.slug}
                filename="investiq-screen.csv"
                initialSort={{ key: "marketCap", dir: "desc" }}
                emptyMessage="No companies match these filters. Try widening the criteria or sweeping them."
              />
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Saved views</CardTitle>
              <CardDescription>Keep a filter set you want to revisit.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={viewName}
                  onChange={(event) => setViewName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") saveView();
                  }}
                  placeholder="Name this view…"
                  aria-label="Saved view name"
                  className="h-9"
                />
                <Button size="sm" onClick={saveView} title="Save the current filters">
                  <Save className="h-3.5 w-3.5" /> Save
                </Button>
              </div>

              {guest ? (
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  You are browsing as a guest, so views are saved in this browser. Sign in to keep them
                  with your account.
                </p>
              ) : null}

              {savedScreens.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
                  No saved views yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {savedScreens.map((screen) => (
                    <li
                      key={screen.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/40 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{screen.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {screen.filters.sector === "all" ? "All sectors" : screen.filters.sector} ·{" "}
                          {formatTimestamp(screen.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button variant="soft" size="sm" onClick={() => applyView(screen)}>
                          Apply
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => deleteView(screen.id)}
                          title={`Delete ${screen.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Bell className="h-4 w-4 text-primary" /> Price alerts
              </CardTitle>
              <CardDescription className="tabular-nums">
                {alerts.length === 0
                  ? "Use the Alert button on any row to arm a price watch."
                  : `${alerts.length} alert${alerts.length === 1 ? "" : "s"} saved in this workspace.`}
              </CardDescription>
            </CardHeader>
            {alerts.length > 0 ? (
              <CardContent>
                <ul className="space-y-2">
                  {alerts.slice(0, 5).map((alert) => (
                    <li
                      key={alert.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-xs"
                    >
                      <Link href={`/company/${alert.slug}`} className="truncate font-medium hover:text-primary">
                        {alert.ticker}
                      </Link>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        above {formatNumber(alert.target)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            ) : null}
          </Card>
        </div>
      </div>

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex max-w-sm items-center gap-2 rounded-xl border border-primary/30 bg-background/90 px-4 py-3 text-sm shadow-xl backdrop-blur-xl"
        >
          <BellPlus className="h-4 w-4 shrink-0 text-primary" />
          <span>{toast}</span>
        </div>
      ) : null}
    </div>
  );
}
