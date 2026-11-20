import "server-only";

import type {
  Company,
  CompanySummary,
  DataFreshness,
  LiveStatus,
  MarketIndex,
  NotificationItem,
} from "./types";

/**
 * Server-side data access for true per-request SSR.
 *
 * Nothing in this module ever substitutes fixtures. A failed or unavailable
 * backend simply returns `null`, and the page renders an explicit offline /
 * error state instead of fabricated numbers.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api/v1";

async function serverFetch<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function getServerCompanies(): Promise<CompanySummary[] | null> {
  return serverFetch<CompanySummary[]>("/companies");
}

export function getServerCompany(slug: string): Promise<Company | null> {
  return serverFetch<Company>(`/companies/${encodeURIComponent(slug)}`);
}

export function getServerIndices(): Promise<MarketIndex[] | null> {
  return serverFetch<MarketIndex[]>("/market/indices");
}

export function getServerFreshness(): Promise<DataFreshness | null> {
  return serverFetch<DataFreshness>("/freshness");
}

export function getServerLiveStatus(): Promise<LiveStatus | null> {
  return serverFetch<LiveStatus>("/live/status");
}

export function getServerNotifications(): Promise<NotificationItem[] | null> {
  return serverFetch<NotificationItem[]>("/notifications");
}
