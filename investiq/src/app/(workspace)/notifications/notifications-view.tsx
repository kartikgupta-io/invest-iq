"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, CheckCheck, RefreshCw } from "lucide-react";
import { useNotifications, useCompanies, useFreshness } from "@/lib/api";
import { useNotificationsStore } from "@/store";
import { getWorkspace, type PriceAlert } from "@/lib/workspace";
import { syncLiveData } from "@/lib/swr";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedControl, type Segment } from "@/components/ui/segmented-control";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusLed } from "@/components/ui/status-led";
import { SkeletonCard } from "@/components/ui/loader";
import { ErrorState } from "@/components/ui/error-state";
import { useToast } from "@/components/ui/toast";
import { NotificationCard, EmptyNotifications } from "@/components/app/notification-card";
import type { NotificationItem } from "@/lib/types";

type Filter = "all" | "price" | "alert" | "document" | "system" | "insight";

const FILTERS: Segment<Filter>[] = [
  { value: "all", label: "All" },
  { value: "price", label: "Price" },
  { value: "alert", label: "Alerts" },
  { value: "document", label: "Filings" },
  { value: "insight", label: "Insights" },
  { value: "system", label: "System" },
];

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

function groupLabel(time: string): string {
  const parsed = new Date(time);
  return Number.isNaN(parsed.getTime()) ? "Undated" : dateFormatter.format(parsed);
}

/** Turn triggered local price alerts into feed items, keeping their real data. */
function alertToNotification(alert: PriceAlert): NotificationItem {
  return {
    id: `alert-${alert.id}`,
    type: "alert",
    title: `Alert: ${alert.ticker} ${alert.direction} ₹${alert.target.toLocaleString("en-IN")}`,
    message: `${alert.name} reached your ${alert.direction} target.`,
    time: alert.triggeredAt ?? alert.createdAt,
    read: false,
    slug: alert.slug,
    source: "Price Alerts",
  };
}

export function NotificationsView({ initial }: { initial: NotificationItem[] | null }) {
  const { push } = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [localAlerts, setLocalAlerts] = useState<NotificationItem[]>([]);
  const [syncing, setSyncing] = useState(false);

  const feed = useNotifications();
  const companies = useCompanies();
  const freshness = useFreshness();
  const { readIds, markRead } = useNotificationsStore();

  useEffect(() => {
    // Read browser-owned alerts after hydration so server and client first
    // renders agree; they are a local enhancement, not part of the SSR feed.
    const timer = setTimeout(() => {
      if (typeof window === "undefined") return;
      setLocalAlerts(getWorkspace().alerts.filter((alert) => alert.triggeredAt).map(alertToNotification));
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const all = useMemo(() => {
    const merged = [...(feed.data ?? []), ...localAlerts];
    const seen = new Set<string>();
    return merged.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [feed.data, localAlerts]);

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: all.length, price: 0, alert: 0, document: 0, insight: 0, system: 0 };
    for (const item of all) result[item.type] = (result[item.type] ?? 0) + 1;
    return result;
  }, [all]);

  const unread = useMemo(() => all.filter((item) => !item.read && !readIds.includes(item.id)), [all, readIds]);

  const visible = useMemo(
    () => (filter === "all" ? all : all.filter((item) => item.type === filter)),
    [all, filter],
  );

  const groups = useMemo(() => {
    const map = new Map<string, NotificationItem[]>();
    for (const item of visible) {
      const key = groupLabel(item.time);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return [...map.entries()];
  }, [visible]);

  async function refresh() {
    setSyncing(true);
    try {
      await syncLiveData();
      await Promise.all([feed.mutate(), companies.mutate(), freshness.mutate()]);
      push({ title: "Live data synced", description: "Quotes and fundamentals are up to date.", tone: "success" });
    } catch (error) {
      push({
        title: "Sync failed",
        description: error instanceof Error ? error.message : String(error),
        tone: "error",
      });
    } finally {
      setSyncing(false);
    }
  }

  const loading = feed.isLoading && initial === null;
  const error = feed.error;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        eyebrow="Intelligence feed"
        title="Notifications"
        description="Real price moves, triggered alerts, filings and sync events — sourced, never invented."
        icon={<BellRing className="h-7 w-7 text-primary" />}
        actions={
          <>
            <Badge variant={freshness.data?.status === "fresh" ? "success" : "warning"} className="gap-1.5">
              <StatusLed tone={freshness.data?.status === "fresh" ? "live" : "stale"} />
              {freshness.data?.status ?? "—"}
            </Badge>
            <Button variant="outline" size="sm" onClick={refresh} disabled={syncing}>
              <RefreshCw className={syncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              {syncing ? "Syncing…" : "Sync now"}
            </Button>
            <Button
              variant="soft"
              size="sm"
              onClick={() => unread.forEach((item) => markRead(item.id))}
              disabled={unread.length === 0}
            >
              <CheckCheck className="h-4 w-4" /> Mark all read
              {unread.length > 0 ? <Badge variant="destructive" className="ml-1">{unread.length}</Badge> : null}
            </Button>
          </>
        }
      />

      <SegmentedControl
        options={FILTERS.map((option) => ({ ...option, count: counts[option.value] }))}
        value={filter}
        onChange={setFilter}
      />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => <SkeletonCard key={index} className="h-24" />)}
        </div>
      ) : error ? (
        <ErrorState
          title="Could not load notifications"
          description={error instanceof Error ? error.message : String(error)}
          onRetry={() => void feed.mutate()}
        />
      ) : groups.length === 0 ? (
        <EmptyNotifications message="Nothing here yet. Trigger a price alert or sync live data to populate the feed." />
      ) : (
        <div className="space-y-6">
          {groups.map(([label, items]) => (
            <section key={label} className="space-y-2.5">
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
                <span className="h-px flex-1 bg-border/60" />
                <span className="tabular-nums">{items.length}</span>
              </h2>
              <div className="space-y-2.5">
                {items.map((item) => (
                  <NotificationCard
                    key={item.id}
                    item={item}
                    read={item.read || readIds.includes(item.id)}
                    onRead={markRead}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
