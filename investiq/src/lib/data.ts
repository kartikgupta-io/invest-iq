"use client";

/**
 * The single client-side data layer.
 *
 * Every market data hook reads the live backend through SWR. There are no
 * fabricated fallbacks: when the backend is unavailable the hook exposes an
 * error/empty state so the UI can say so. Static files under `src/data` are
 * used only for genuinely local content (help articles) and brand colours.
 */

import { useMemo } from "react";
import useSWR from "swr";
import { API_BASE, fetcher } from "./swr";
import { helpArticles } from "../data/account";
import { getActiveUser } from "./workspace";
import { usePortfolioStore } from "../store";
import type {
  AnnualFinancials,
  Company,
  CompanySummary,
  DataFreshness,
  DocumentChunk,
  FinancialDocument,
  HelpArticle,
  LiveStatus,
  MarketIndex,
  NotificationItem,
  PeerCompany,
  PortfolioHolding,
  TickerQuote,
  User,
  Watchlist,
} from "./types";

export type DiscoveryResult = {
  companies: CompanySummary[];
  resolved: boolean;
  cached: boolean;
  query: string;
  source?: string;
  error?: string;
};

type RawSearchHit = {
  id: string;
  documentId: string;
  title: string;
  page: number;
  snippet: string;
  score: number;
  url?: string | null;
  source?: string;
};
type SearchHit = {
  id: string;
  documentId: string;
  page: number;
  section: string;
  text: string;
  score: number;
  url?: string;
  source?: string;
  kind?: "filing" | "news";
};

type RawNewsItem = {
  id: string;
  title: string;
  publisher?: string | null;
  url: string;
  publishedAt?: string | null;
  source?: string;
};

/** SWR exposes `error`; several views also read the convenience `isError`. */
const withIsError = <T extends { error: unknown }>(result: T) => ({
  ...result,
  isError: Boolean(result.error),
});

async function postFetcher<T>(key: unknown, body?: unknown): Promise<T> {
  const parts = key as readonly unknown[];
  const response = await fetch(String(parts[0]), {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body ?? parts[1]),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return (await response.json()) as T;
}

const url = (path: string) => `${API_BASE}${path}`;

function withParams(path: string, params: Record<string, string | number>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) search.set(key, String(value));
  return `${API_BASE}${path}?${search.toString()}`;
}

export function useCompanies() {
  return withIsError(useSWR<CompanySummary[]>(url("/companies"), fetcher));
}

export function useCompany(slug: string) {
  return withIsError(useSWR<Company>(slug ? url(`/companies/${encodeURIComponent(slug)}`) : null, fetcher));
}

export function useAllCompanySlugs() {
  const { data, isLoading, error } = useCompanies();
  return { data: data?.map((c) => c.slug) ?? [], isLoading, error };
}

export function useMarketIndices() {
  return withIsError(useSWR<MarketIndex[]>(url("/market/indices"), fetcher));
}

export function useFreshness() {
  return withIsError(useSWR<DataFreshness>(url("/freshness"), fetcher, { refreshInterval: 60_000 }));
}

export function useLiveStatus() {
  return withIsError(useSWR<LiveStatus>(url("/live/status"), fetcher, { refreshInterval: 60_000 }));
}

export function useQuote(ticker: string) {
  return withIsError(
    useSWR<Record<string, unknown>>(ticker ? url(`/live/quote/${encodeURIComponent(ticker)}`) : null, fetcher),
  );
}

export function useNotifications() {
  return withIsError(useSWR<NotificationItem[]>(url("/notifications"), fetcher, { refreshInterval: 60_000 }));
}

export function useWatchlists() {
  return withIsError(useSWR<Watchlist[]>(url("/watchlists"), fetcher));
}

export function useFinancials(slug: string) {
  return withIsError(
    useSWR<AnnualFinancials[]>(slug ? url(`/companies/${encodeURIComponent(slug)}/financials`) : null, fetcher),
  );
}

export function useDocuments(slug: string) {
  return withIsError(
    useSWR<FinancialDocument[]>(slug ? url(`/companies/${encodeURIComponent(slug)}/documents`) : null, fetcher),
  );
}

export function useDocumentChunks(document?: FinancialDocument) {
  return withIsError(
    useSWR<DocumentChunk[]>(document ? url(`/documents/${encodeURIComponent(document.id)}/chunks`) : null, fetcher),
  );
}

export function usePeers(slug: string) {
  return withIsError(
    useSWR<PeerCompany[]>(slug ? url(`/companies/${encodeURIComponent(slug)}/peers`) : null, fetcher),
  );
}

/** Backwards-compatible name used by the company overview. */
export const usePeerGroup = usePeers;

export function useValuation(slug: string) {
  const company = useCompany(slug);
  return { data: company.data?.valuation ?? [], isLoading: company.isLoading, isError: company.isError };
}

export function useQuoteFor(slug: string) {
  return useCompany(slug).data?.quote as TickerQuote | undefined;
}

/**
 * Company search: instant local coverage first, best-effort external lookup
 * only when the built-in universe has no match. External results are cached on
 * the backend, so the fallback is cheap and never invents a company.
 */
export type SymbolMatch = {
  ticker: string;
  slug: string;
  name: string;
  exchange: string;
  currency: string;
  series?: string;
  isin?: string;
  local?: boolean;
};

/** Instant local lookup across all 2,600+ NSE-listed domestic equities. */
export function useSymbolSearch(query: string, limit = 12) {
  const term = query.trim();
  return useSWR<{ companies: SymbolMatch[]; count: number }>(
    term.length > 0 ? withParams("/live/symbols", { q: term, limit }) : null,
    fetcher,
    { dedupingInterval: 30_000 },
  );
}

export function useCompanySearch(query: string) {
  const term = query.trim();
  const local = useSWR<CompanySummary[]>(
    term.length > 0 ? withParams("/companies", { q: term }) : null,
    fetcher,
    { dedupingInterval: 10_000 },
  );
  const symbols = useSymbolSearch(term, 12);
  const needExternal = term.length >= 2 && local.data !== undefined && (local.data?.length ?? 0) === 0;
  const external = useSWR<DiscoveryResult>(
    needExternal ? withParams("/live/discover", { q: term }) : null,
    fetcher,
    { dedupingInterval: 60_000 },
  );

  const data = useMemo(() => {
    // One row per slug: NSE/BSE variants of the same company share a detail
    // route, and duplicate slugs produce duplicate React keys in the palette.
    const bySlug = new Map<string, CompanySummary>();
    const fromSymbols: CompanySummary[] = (symbols.data?.companies ?? []).map((item) => ({
      slug: item.slug,
      ticker: item.ticker,
      name: item.name,
      sector: item.series ? `NSE · ${item.series}` : "NSE",
      exchange: item.exchange,
      currency: item.currency,
      marketCap: 0,
      price: 0,
      changePct: 0,
      peRatio: 0,
      roe: null,
      revenueGrowth: null,
      liveData: false,
    }));
    for (const item of [...(local.data ?? []), ...(external.data?.companies ?? []), ...fromSymbols]) {
      const key = item.slug.toLowerCase();
      const previous = bySlug.get(key);
      if (!previous || ((item.liveData ? 1 : 0) > (previous.liveData ? 1 : 0))) bySlug.set(key, item);
    }
    return [...bySlug.values()];
  }, [local.data, external.data, symbols.data]);

  return {
    data,
    isLoading: symbols.isLoading || local.isLoading || (needExternal && external.isLoading),
    isError: Boolean(symbols.error || local.error || external.error),
    error: symbols.error ?? local.error ?? external.error ?? null,
    external: needExternal ? external.data ?? null : null,
    universe: symbols.data ?? null,
  };
}

export function useSemanticSearch(query: string, companySlug?: string) {
  const enabled = query.trim().length > 2;
  // The first SWR key element is the URL used by postFetcher. It must be a
  // real absolute endpoint — a bare label produced a relative POST and no data.
  const result = useSWR<{ hits: RawSearchHit[] }>(
    enabled ? [`${API_BASE}/search`, query, companySlug ?? null] : null,
    (key) => postFetcher(key, { query, limit: 8, company: companySlug ?? null }),
  );
  const hits: SearchHit[] = (result.data?.hits ?? []).map((hit) => ({
    id: hit.id,
    documentId: hit.documentId,
    page: hit.page,
    section: hit.title,
    text: hit.snippet,
    score: hit.score,
    url: hit.url ?? undefined,
    source: hit.source,
    kind: "filing",
  }));
  return { data: hits, isLoading: result.isLoading, isError: Boolean(result.error) };
}

/** Real, clickable news from Yahoo, Google News and NSE filings. */
export function useNews(query: string, ticker?: string) {
  const enabled = query.trim().length > 2;
  const result = useSWR<{ items: RawNewsItem[] }>(
    enabled ? withParams("/live/news", { q: query, limit: 5, ...(ticker ? { ticker } : {}) }) : null,
    fetcher,
  );
  const items: SearchHit[] = (result.data?.items ?? []).map((item) => ({
    id: item.id,
    documentId: item.id,
    page: 0,
    section: item.title,
    text: item.publisher ? `${item.publisher} · ${item.title}` : item.title,
    score: 0,
    url: item.url,
    source: item.source ?? item.publisher ?? "Yahoo Finance News",
    kind: "news",
  }));
  return { data: items, isLoading: result.isLoading, isError: Boolean(result.error) };
}

export type CompanyExtraItem = {
  id: string;
  title: string;
  publisher?: string | null;
  url: string;
  publishedAt?: string | null;
  source?: string;
};

export type CompanyExtras = {
  slug: string;
  ticker: string;
  wikipedia: {
    title: string;
    description: string;
    extract: string;
    url: string;
    imageUrl?: string | null;
    source: string;
  } | null;
  announcements: CompanyExtraItem[];
  sources: string[];
};

/** Non-Yahoo company intelligence: Wikipedia background and NSE filings. */
export function useCompanyExtras(slug: string) {
  return withIsError(
    useSWR<CompanyExtras>(slug ? url(`/live/company-extras/${encodeURIComponent(slug)}`) : null, fetcher),
  );
}

/** Genuine local content — documentation, not market data. */
export function useHelpArticles(category?: string) {
  const filtered = category && category !== "All"
    ? helpArticles.filter((a) => a.category === category)
    : helpArticles;
  return { data: filtered, isLoading: false };
}

export function useHelpCategories() {
  return ["All", ...new Set(helpArticles.map((a) => a.category))];
}

/** Local workspace identity — no server-backed profile is claimed. */
export function useUser(): { data: User | null } {
  const workspaceUser = typeof window === "undefined" ? null : getActiveUser();
  if (!workspaceUser) return { data: null };
  const initials = workspaceUser.name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return {
    data: {
      name: workspaceUser.name,
      email: workspaceUser.email,
      role: "Local workspace",
      plan: "Local",
      initials: initials || "U",
      memberSince: new Date(workspaceUser.createdAt).toLocaleDateString(),
    },
  };
}

/**
 * Holdings are owned by the local workspace; live prices are overlaid from
 * the backend so a position never shows a fabricated quote.
 */
export function useHoldings() {
  const stored = usePortfolioStore((s) => s.holdings);
  const { data: companies = [] } = useCompanies();
  const data = useMemo(
    () =>
      stored.map((holding) => {
        const live = companies.find(
          (c) => c.ticker === holding.ticker || c.slug === holding.slug,
        );
        if (!live) return holding;
        return {
          ...holding,
          currentPrice: live.price ?? holding.currentPrice,
          dayChangePct: live.changePct ?? holding.dayChangePct,
        } satisfies PortfolioHolding;
      }),
    [stored, companies],
  );
  return { data, isLoading: false };
}

export type { HelpArticle, NotificationItem, PortfolioHolding };
