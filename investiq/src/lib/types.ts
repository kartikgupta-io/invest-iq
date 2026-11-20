export type Exchange = "NSE" | "BSE" | "NYSE" | "NASDAQ";

export interface CompanyProfile {
  slug: string;
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  exchange: string;
  currency: string;
  currencyCode: string;
  founded: number;
  listed: string;
  headquarters: string;
  website: string;
  description: string;
  employees: number;
  accent: string;
  market: string;
}

export interface AnnualFinancials {
  year: string;
  revenue: number | null;
  revenueGrowth: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  ebitda: number | null;
  netIncome: number | null;
  eps: number | null;
  netMargin: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  ebitdaMargin: number | null;
  returnOnAssets: number | null;
  totalAssets: number | null;
  totalEquity: number | null;
  totalDebt: number | null;
  netDebt: number | null;
  cash: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  operatingCashFlow: number | null;
  investingCashFlow: number | null;
  financingCashFlow: number | null;
  freeCashFlow: number | null;
  capex: number | null;
  roe: number | null;
  roce: number | null;
  interestCover: number | null;
  bookValue: number | null;
  dividendPerShare: number | null;
  dividendYield: number | null;
  sharesOutstanding: number | null;
  revenuePerShare: number | null;
  priceToSales: number | null;
  evToEbitda: number | null;
  peRatio: number | null;
  priceToBook: number | null;
}

export interface BusinessSegment {
  name: string;
  revenue: number;
  share: number;
  growth: number;
}

export interface QuarterlyResult {
  quarter: string;
  endDate: string;
  revenue: number | null;
  netIncome: number | null;
  ebitda: number | null;
  eps: number | null;
  margin: number | null;
}

export interface ValuationPoint {
  year: string;
  price: number | null;
  marketCap: number | null;
  peRatio: number | null;
  priceToBook: number | null;
  evToEbitda: number | null;
  dividendYield: number | null;
}

export interface TickerQuote {
  price: number;
  change: number;
  changePct: number;
  open: number | null;
  high: number;
  low: number;
  volume: number;
  previousClose: number;
  marketCap: number;
  peRatio: number;
  eps: number | null;
  dividendYield: number | null;
  high52Week: number;
  low52Week: number;
}

export type DocumentType =
  | "10-K"
  | "10-Q"
  | "8-K"
  | "Annual Report"
  | "Quarterly Report"
  | "Investor Presentation"
  | "Earnings Call Transcript";

export interface DocumentVersion {
  version: string;
  uploadedAt: string;
  changedBy: string;
  note: string;
}

export interface FinancialDocument {
  id: string;
  companySlug: string;
  type: DocumentType;
  title: string;
  form: string;
  fiscalPeriod: string;
  filedDate: string;
  periodEnd: string;
  source: "SEC EDGAR" | "NSE" | "BSE" | "Investor Relations";
  sourceUrl: string;
  sizeKb: number;
  pages: number;
  sha256: string;
  latestVersion: string;
  versions: FilingVersion[];
}

export interface FilingVersion {
  version: string;
  uploadedAt: string;
  note: string;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  page: number;
  section: string;
  text: string;
}

export interface Citation {
  id: string;
  documentId: string;
  title: string;
  source: string;
  page: number;
  snippet: string;
  score: number;
}

export interface HelpArticle {
  id: string;
  title: string;
  category: string;
  body: string;
}

export interface NotificationItem {
  id: string;
  type: "price" | "alert" | "system" | "document" | "insight";
  title: string;
  message: string;
  time: string;
  read: boolean;
  /** Company to open when the notification is clicked, when it is price-linked. */
  slug?: string | null;
  /** Real upstream provenance shown in the UI (never invented). */
  source?: string | null;
}

export interface PortfolioHolding {
  slug: string;
  ticker: string;
  name: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  dayChangePct: number;
  allocationPct: number;
}

export interface Watchlist {
  id: string;
  name: string;
  color: string;
  symbols: string[];
  updatedAt: string;
}

export interface MarketIndex {
  ticker: string;
  name: string;
  value: number;
  changePct: number;
}

export interface User {
  name: string;
  email: string;
  role: string;
  plan: string;
  initials: string;
  memberSince: string;
}

export interface DataFreshness {
  status: "fresh" | "stale" | "offline";
  asOf: string | null;
  ageSeconds: number | null;
  staleAfterSeconds: number;
  source: string;
}

export interface ScoreCard {
  label: string;
  value: number;
  changePct: number;
  spark: number[];
}

export interface RiskPoint {
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
}

export interface PeerCompany {
  slug: string;
  ticker: string;
  name: string;
  marketCap: number | null;
  peRatio: number | null;
  roe: number | null;
  margin: number | null;
  revenueGrowth: number | null;
  returnYtd: number | null;
}

export interface SegmentBreakdownPoint {
  year: string;
  segments: BusinessSegment[];
}

export interface Company {
  profile: CompanyProfile;
  quote: TickerQuote;
  annual: AnnualFinancials[];
  valuation: ValuationPoint[];
  segments: SegmentBreakdownPoint[];
  quarterly: Record<string, QuarterlyResult[]>;
  riskFactors: RiskPoint[];
  managementDiscussion: string;
  documents: FinancialDocument[];
  provenance?: {
    mode: "live" | "legacy";
    asOf: string | null;
    sources: string[];
    unavailable: string[];
  } | null;
}

export interface CompanySummary {
  slug: string;
  ticker: string;
  name: string;
  sector: string;
  exchange: string;
  currency: string;
  website?: string | null;
  marketCap: number;
  price: number;
  changePct: number;
  peRatio: number;
  roe: number | null;
  revenueGrowth: number | null;
}

export interface CompanyDetails extends CompanyProfile {
  quote: TickerQuote;
  annual: AnnualFinancials[];
  segments: SegmentBreakdownPoint[];
  quarterly: Record<string, QuarterlyResult[]>;
  riskFactors: RiskPoint[];
  managementDiscussion: string;
  documents: FinancialDocument[];
  peerGroup: Peer[];
}

export interface Peer {
  ticker: string;
  name: string;
  marketCap: number;
  peRatio: number;
  roe: number;
  revenueGrowth: number;
  returnYtd: number;
}

/** Snapshot of the backend's last successful live ingestion run. */
export interface LiveStatus {
  cached: boolean;
  savedAt: string | null;
  companies: number;
  evidenceCount: number;
  sources: string[];
}

/** Server-rendered initial payload for the dashboard (null = backend offline). */
export interface DashboardInitial {
  companies: CompanySummary[] | null;
  indices: MarketIndex[] | null;
  freshness: DataFreshness | null;
  liveStatus: LiveStatus | null;
}

/** Server-rendered initial payload for a company detail page. */
export interface CompanyDetailInitial {
  company: Company | null;
  freshness: DataFreshness | null;
  liveStatus: LiveStatus | null;
}