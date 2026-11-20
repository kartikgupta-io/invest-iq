import type { HelpArticle, PortfolioHolding } from "../lib/types";

// Static fixtures for user data (profile, holdings, watchlists, notifications)
// were removed: they were fabricated and aged badly. Market data now comes
// from the live API; user-owned data lives in the local workspace.

export function buildPortfolioMetrics(holdings: PortfolioHolding[]) {
  const totalInvested = holdings.reduce((s, h) => s + h.quantity * h.avgPrice, 0);
  const totalValue = holdings.reduce((s, h) => s + h.quantity * h.currentPrice, 0);
  const profit = totalValue - totalInvested;
  const returnPct = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;
  return { totalInvested, totalValue, profit, returnPct };
}

export const helpArticles: HelpArticle[] = [
  {
    id: "h1",
    title: "How do I add a company to a watchlist?",
    category: "Watchlists",
    body: "Open any company workspace and click the star icon in the header, or navigate to Watchlists and search for the company by ticker or name. Select the target watchlist and the symbol is added instantly. You can create new watchlists from the Watchlists dashboard.",
  },
  {
    id: "h2",
    title: "Understanding financial ratios",
    category: "Financials",
    body: "InvestIQ surfaces thirteen core metrics including revenue, profit, margins, cash flow, debt, ROE, ROCE, EPS, valuation, and market cap. Each chart includes a legend, period selector, and a downloadable snapshot so you can compare performance across fiscal years.",
  },
  {
    id: "h3",
    title: "How does AI semantic search work?",
    category: "AI & Research",
    body: "Documents are chunked and embedded into a vector index. When you ask a question, InvestIQ maps your query to the most relevant document excerpts and returns them with citations to the source filing, page, and section, so you can verify every claim.",
  },
  {
    id: "h4",
    title: "Managing notifications",
    category: "Account",
    body: "Open Settings > Notifications to choose which alerts you receive, including price thresholds, new filings, AI insights, and the weekly portfolio digest. You can silence categories or set quiet hours to reduce noise.",
  },
  {
    id: "h5",
    title: "Data sources and reliability",
    category: "Research",
    body: "InvestIQ ingests documents exclusively from official sources: SEC EDGAR, NSE, BSE, and issuer investor-relations websites. Every filing is versioned and its content hash recorded so you can be confident of provenance and fidelity.",
  },
  {
    id: "h6",
    title: "Building a portfolio",
    category: "Portfolio",
    body: "The portfolio module tracks holdings in real time, showing allocation, unrealised gains, cost basis, and daily performance. Run scenario analysis to see the impact of adding or removing positions.",
  },
];

export function faqItems(): { q: string; a: string }[] {
  return [
    { q: "Is the data real official filings?", a: "Yes, InvestIQ ingests only from SEC EDGAR, NSE, BSE, and official IR websites. Every document keeps a content hash and version history." },
    { q: "Can I export reports?", a: "Premium users can export charts, tables, and research snippets with embedded citations." },
    { q: "Which markets are covered?", a: "Indian equities on NSE/BSE with a US EDGAR ingestion pipeline for cross-listed issuers." },
    { q: "How often is data refreshed?", a: "Live quotes and fundamentals are fetched on demand from public sources — Yahoo Finance, Screener.in and issuer filings — and cached for 30 minutes. Every figure is cited back to its original source so you can verify it." },
  ];
}

function colorFromSlug(slug: string) {
  const map: Record<string, string> = {
    reliance: "#7c3aed",
    tcs: "#4f46e5",
    "hdfc-bank": "#0ea5e9",
    infosys: "#8b5cf6",
    "icici-bank": "#f97316",
    "bharti-airtel": "#ef4444",
    itc: "#16a34a",
    "hindustan-unilever": "#f43f5e",
    "state-bank-of-india": "#3b82f6",
    "tata-motors": "#f59e0b",
    "asian-paints": "#14b8a6",
    wipro: "#6366f1",
  };
  return map[slug] ?? "#7c3aed";
}

export { colorFromSlug };

export function initialsFor(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

