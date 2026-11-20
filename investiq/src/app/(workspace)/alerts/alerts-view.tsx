"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import useSWR from "swr";
import { Bell, Info, Plus, Search, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { SkeletonCard } from "@/components/ui/loader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusLed } from "@/components/ui/status-led";
import { API_BASE } from "@/lib/swr";
import type { CompanySummary } from "@/lib/types";
import { cn, formatCurrency, formatOrDash, formatPercent, relativeTime } from "@/lib/utils";
import { getWorkspace, uid, updateWorkspace, type PriceAlert } from "@/lib/workspace";

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return error ? String(error) : "The live service did not respond.";
}

/**
 * localStorage-backed alert store. useSyncExternalStore keeps the cached
 * snapshot referentially stable and hydration-safe (server snapshot is empty).
 */
const EMPTY_ALERTS: PriceAlert[] = [];
let alertsCache: PriceAlert[] | null = null;
const alertListeners = new Set<() => void>();

function readAlerts(): PriceAlert[] {
  if (alertsCache === null) alertsCache = getWorkspace().alerts;
  return alertsCache;
}

function writeAlerts(next: PriceAlert[]): void {
  alertsCache = next;
  updateWorkspace({ alerts: next });
  alertListeners.forEach((listener) => listener());
}

function subscribeAlerts(listener: () => void): () => void {
  alertListeners.add(listener);
  function onStorage(event: StorageEvent) {
    if (event.key?.startsWith("investiq-workspace:")) {
      alertsCache = null;
      alertListeners.forEach((cb) => cb());
    }
  }
  window.addEventListener("storage", onStorage);
  return () => {
    alertListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getAlertsSnapshot(): PriceAlert[] {
  return readAlerts();
}

function getServerAlertsSnapshot(): PriceAlert[] {
  return EMPTY_ALERTS;
}

export function AlertsView({ initial }: { initial: { companies?: CompanySummary[] | null } }) {
  /** Real quotes — SSR-hydrated, then the global SWRConfig keeps them fresh. */
  const companies = useSWR<CompanySummary[]>(`${API_BASE}/companies`, {
    fallbackData: initial.companies ?? undefined,
  });
  const companyList = useMemo(() => companies.data ?? [], [companies.data]);

  const alerts = useSyncExternalStore(
    subscribeAlerts,
    getAlertsSnapshot,
    getServerAlertsSnapshot,
  );

  function persist(next: PriceAlert[]) {
    writeAlerts(next);
  }

  /**
   * Evaluate every alert against the latest live quote. A met condition stamps
   * `triggeredAt` exactly once and persists it, so a trigger is sticky even if
   * the price later retreats.
   */
  useEffect(() => {
    if (companyList.length === 0) return;
    const bySlug = new Map(companyList.map((c) => [c.slug, c]));
    let changed = false;
    const next = alerts.map((alert) => {
      if (alert.triggeredAt) return alert;
      const company = bySlug.get(alert.slug);
      if (!company) return alert;
      const met =
        alert.direction === "above" ? company.price >= alert.target : company.price <= alert.target;
      if (!met) return alert;
      changed = true;
      return { ...alert, triggeredAt: new Date().toISOString() };
    });
    if (changed) writeAlerts(next);
  }, [alerts, companyList]);

  const priceBySlug = useMemo(
    () => new Map(companyList.map((c) => [c.slug, c])),
    [companyList],
  );

  const sortedAlerts = useMemo(() => {
    return [...alerts].sort((a, b) => {
      const at = a.triggeredAt ? 1 : 0;
      const bt = b.triggeredAt ? 1 : 0;
      if (at !== bt) return bt - at;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [alerts]);

  const triggeredCount = alerts.filter((a) => a.triggeredAt).length;

  // ---- Create-alert form state -------------------------------------------------
  const [selectedSlug, setSelectedSlug] = useState("");
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyOpen, setCompanyOpen] = useState(false);
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [target, setTarget] = useState("");
  const [formError, setFormError] = useState("");
  const comboboxRef = useRef<HTMLDivElement>(null);

  const selectedCompany = companyList.find((c) => c.slug === selectedSlug) ?? null;
  const filteredCompanies = useMemo(() => {
    const q = companyQuery.trim().toLowerCase();
    const pool = q
      ? companyList.filter((c) => `${c.name} ${c.ticker} ${c.sector}`.toLowerCase().includes(q))
      : companyList;
    return pool.slice(0, 8);
  }, [companyList, companyQuery]);

  useEffect(() => {
    if (!companyOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (comboboxRef.current && !comboboxRef.current.contains(event.target as Node)) {
        setCompanyOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [companyOpen]);

  function pickCompany(company: CompanySummary) {
    setSelectedSlug(company.slug);
    setCompanyQuery(`${company.name} · ${company.ticker}`);
    setTarget(String(company.price)); // prefill with the live price
    setFormError("");
    setCompanyOpen(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const price = Number(target);
    if (!selectedCompany) {
      setFormError("Choose a company from the live list.");
      return;
    }
    if (!target.trim() || !Number.isFinite(price) || price <= 0) {
      setFormError("Enter a target price greater than zero.");
      return;
    }
    const alert: PriceAlert = {
      id: uid("alert"),
      slug: selectedCompany.slug,
      ticker: selectedCompany.ticker,
      name: selectedCompany.name,
      direction,
      target: price,
      createdAt: new Date().toISOString(),
    };
    persist([alert, ...alerts]);
    setTarget("");
    setSelectedSlug("");
    setCompanyQuery("");
    setFormError("");
    setCompanyOpen(false);
  }

  function removeAlert(id: string) {
    persist(alerts.filter((a) => a.id !== id));
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold">Price Alerts</h1>
            <StatusLed tone="live" label="Live quotes" />
          </div>
          <p className="text-sm text-muted-foreground">
            Real thresholds, checked against live market quotes on every data refresh.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {triggeredCount > 0 && <Badge variant="success">{triggeredCount} triggered</Badge>}
          <Badge variant="secondary">{alerts.length - triggeredCount} watching</Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="h-4 w-4 text-primary" /> Create alert
              </CardTitle>
              <CardDescription>Pick a company and a price threshold to watch.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSubmit} noValidate>
                <div className="space-y-1.5">
                  <label htmlFor="alert-company" className="text-sm font-medium">
                    Company
                  </label>
                  <div className="relative" ref={comboboxRef}>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="alert-company"
                      role="combobox"
                      aria-expanded={companyOpen}
                      autoComplete="off"
                      className="pl-9"
                      placeholder={companyList.length ? "Search name or ticker…" : "Loading companies…"}
                      value={companyQuery}
                      onFocus={() => setCompanyOpen(true)}
                      onChange={(e) => {
                        setCompanyQuery(e.target.value);
                        setSelectedSlug("");
                        setFormError("");
                        setCompanyOpen(true);
                      }}
                    />
                    {companyOpen && (
                      <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-border/60 bg-popover p-1 shadow-xl">
                        {filteredCompanies.map((c) => (
                          <button
                            type="button"
                            key={c.slug}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickCompany(c)}
                            className={cn(
                              "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent",
                              selectedSlug === c.slug && "bg-primary/10 hover:bg-primary/15",
                            )}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium">{c.name}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {c.ticker} · {c.sector}
                              </span>
                            </span>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                              {formatCurrency(c.price)}
                            </span>
                          </button>
                        ))}
                        {filteredCompanies.length === 0 && (
                          <p className="px-3 py-2 text-sm text-muted-foreground">No companies match.</p>
                        )}
                      </div>
                    )}
                  </div>
                  {selectedCompany && (
                    <p className="text-xs text-muted-foreground">
                      Live price {formatCurrency(selectedCompany.price)} · {selectedCompany.exchange}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="alert-direction" className="text-sm font-medium">
                    Condition
                  </label>
                  <Select value={direction} onValueChange={(v) => setDirection(v as "above" | "below")}>
                    <SelectTrigger id="alert-direction">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="above">Price is at or above</SelectItem>
                      <SelectItem value="below">Price is at or below</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="alert-target" className="text-sm font-medium">
                    Target price
                  </label>
                  <Input
                    id="alert-target"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    placeholder="0.00"
                    className="tabular-nums"
                    value={target}
                    onChange={(e) => {
                      setTarget(e.target.value);
                      setFormError("");
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Prefilled from the live quote when you choose a company.
                  </p>
                </div>

                {formError && <p className="text-sm text-destructive">{formError}</p>}

                <Button type="submit" className="w-full" disabled={companyList.length === 0}>
                  <Bell className="h-4 w-4" /> Create alert
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Info className="h-4 w-4 text-primary" /> How this works
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Alerts are evaluated against <span className="text-foreground">real Yahoo Finance
                quotes</span> delivered by the InvestIQ live backend — there is no simulated or
                fabricated price data here.
              </p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>On every data refresh, the latest live price is compared to your target.</li>
                <li>
                  An alert fires when price is at or above an <em>above</em> target, or at or below a{" "}
                  <em>below</em> target.
                </li>
                <li>
                  Once triggered it is stamped with a timestamp and stays marked until you delete it.
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-lg font-semibold">Your alerts</h2>

          {companies.isLoading && (
            <div className="space-y-3">
              <SkeletonCard className="h-28" />
              <SkeletonCard className="h-28" />
            </div>
          )}

          {companies.error && (
            <ErrorState
              title="Couldn't load live companies"
              description={messageOf(companies.error)}
              onRetry={() => void companies.mutate()}
            />
          )}

          {!companies.isLoading && !companies.error && sortedAlerts.length === 0 && (
            <EmptyState
              icon={<Bell className="h-6 w-6" />}
              title="No alerts yet"
              description="Create one with the form to start watching a live price. We'll flag it the moment your target is reached."
            />
          )}

          {!companies.isLoading && !companies.error && sortedAlerts.length > 0 && (
            <div className="space-y-3">
              {sortedAlerts.map((alert) => {
                const company = priceBySlug.get(alert.slug);
                const livePrice = company?.price ?? null;
                const met =
                  livePrice != null &&
                  (alert.direction === "above" ? livePrice >= alert.target : livePrice <= alert.target);
                const triggered = Boolean(alert.triggeredAt) || met;
                const distancePct =
                  livePrice != null && livePrice > 0
                    ? ((alert.target - livePrice) / livePrice) * 100
                    : null;

                return (
                  <Card key={alert.id} className={cn(triggered && "border-emerald-500/40")}>
                    <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                              alert.direction === "above"
                                ? "bg-emerald-500/10 text-emerald-500"
                                : "bg-amber-500/10 text-amber-500",
                            )}
                          >
                            {alert.direction === "above" ? (
                              <TrendingUp className="h-4 w-4" />
                            ) : (
                              <TrendingDown className="h-4 w-4" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{alert.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {alert.ticker} · created {relativeTime(alert.createdAt)}
                            </p>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Notify when price is{" "}
                          <span className="font-medium text-foreground">
                            {alert.direction} {formatCurrency(alert.target)}
                          </span>
                        </p>
                      </div>

                      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 sm:justify-end">
                        <div className="text-left sm:text-right">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Live price
                          </p>
                          <p className="font-semibold tabular-nums">
                            {formatOrDash(livePrice, (n) => formatCurrency(n))}
                          </p>
                        </div>
                        <div className="text-left sm:text-right">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            To target
                          </p>
                          <p
                            className={cn(
                              "font-medium tabular-nums",
                              distancePct == null
                                ? "text-muted-foreground"
                                : distancePct >= 0
                                  ? "text-emerald-500"
                                  : "text-amber-500",
                            )}
                          >
                            {distancePct == null
                              ? "—"
                              : `${distancePct >= 0 ? "+" : ""}${formatPercent(distancePct)}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {triggered ? (
                            <Badge variant="success">
                              <StatusLed tone="live" label="Triggered" />
                              Triggered
                              {alert.triggeredAt ? ` · ${relativeTime(alert.triggeredAt)}` : ""}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Watching</Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            aria-label={`Delete alert for ${alert.ticker}`}
                            onClick={() => removeAlert(alert.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
