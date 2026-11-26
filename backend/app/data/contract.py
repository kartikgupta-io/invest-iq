"""Shared data contract for the InvestIQ backend.

Pydantic models mirror the frontend TypeScript interfaces in
`investiq/src/lib/types.ts`, plus the abstract ``DataStore`` every
persistence/search backend must implement. API routers depend only on
``DataStore`` and these models, never on a concrete implementation.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Literal

from pydantic import BaseModel, Field

DocumentType = Literal[
    "10-K", "10-Q", "8-K", "Annual Report", "Quarterly Report", "Investor Presentation", "Earnings Call Transcript"
]
DocumentSource = Literal["SEC EDGAR", "NSE", "BSE", "Investor Relations"]
Exchange = Literal["NSE", "BSE", "NYSE", "NASDAQ"]
NotificationType = Literal["price", "alert", "system", "document", "insight"]


class CompanyProfile(BaseModel):
    slug: str
    ticker: str
    name: str
    sector: str
    industry: str
    exchange: str
    currency: str
    currencyCode: str
    founded: int
    listed: str
    headquarters: str
    website: str
    description: str
    employees: int
    accent: str
    market: str


class AnnualFinancials(BaseModel):
    year: str
    revenue: float | None = None
    revenueGrowth: float | None = None
    grossProfit: float | None = None
    operatingIncome: float | None = None
    ebitda: float | None = None
    netIncome: float | None = None
    eps: float | None = None
    netMargin: float | None = None
    grossMargin: float | None = None
    operatingMargin: float | None = None
    ebitdaMargin: float | None = None
    returnOnAssets: float | None = None
    totalAssets: float | None = None
    totalEquity: float | None = None
    totalDebt: float | None = None
    netDebt: float | None = None
    cash: float | None = None
    debtToEquity: float | None = None
    currentRatio: float | None = None
    operatingCashFlow: float | None = None
    investingCashFlow: float | None = None
    financingCashFlow: float | None = None
    freeCashFlow: float | None = None
    capex: float | None = None
    roe: float | None = None
    roce: float | None = None
    interestCover: float | None = None
    bookValue: float | None = None
    dividendPerShare: float | None = None
    dividendYield: float | None = None
    sharesOutstanding: float | None = None
    revenuePerShare: float | None = None
    priceToSales: float | None = None
    evToEbitda: float | None = None
    peRatio: float | None = None
    priceToBook: float | None = None
    # Every numeric row actually reported by the source, keyed by its exact
    # label. Typed fields above are a convenience view; this dict guarantees
    # no sourced metric is discarded.
    metrics: dict[str, float | None] = Field(default_factory=dict)


class BusinessSegment(BaseModel):
    name: str
    revenue: float
    share: float
    growth: float


class QuarterlyResult(BaseModel):
    quarter: str
    endDate: str
    revenue: float | None = None
    netIncome: float | None = None
    ebitda: float | None = None
    eps: float | None = None
    margin: float | None = None


class SegmentBreakdownPoint(BaseModel):
    year: str
    segments: list[BusinessSegment]


class ValuationPoint(BaseModel):
    year: str
    price: float | None = None
    marketCap: float | None = None
    peRatio: float | None = None
    priceToBook: float | None = None
    evToEbitda: float | None = None
    dividendYield: float | None = None


class TickerQuote(BaseModel):
    price: float
    change: float
    changePct: float
    open: float | None = None
    high: float
    low: float
    volume: int
    previousClose: float
    marketCap: float
    peRatio: float
    eps: float | None = None
    dividendYield: float | None = None
    high52Week: float
    low52Week: float


class FilingVersion(BaseModel):
    version: str
    uploadedAt: str
    note: str


class FinancialDocument(BaseModel):
    id: str
    companySlug: str
    type: DocumentType
    title: str
    form: str
    fiscalPeriod: str
    filedDate: str | None = None
    periodEnd: str | None = None
    source: DocumentSource
    sourceUrl: str
    sizeKb: int | None = None
    pages: int | None = None
    sha256: str | None = None
    latestVersion: str | None = None
    versions: list[FilingVersion] = []


class DocumentChunk(BaseModel):
    id: str
    documentId: str
    page: int
    section: str
    text: str


class Citation(BaseModel):
    id: str
    documentId: str
    title: str
    source: str
    page: int
    snippet: str
    score: float
    url: str | None = None


class RiskPoint(BaseModel):
    title: str
    description: str
    severity: Literal["low", "medium", "high"]


class PeerCompany(BaseModel):
    slug: str
    ticker: str
    name: str
    marketCap: float | None = None
    peRatio: float | None = None
    roe: float | None = None
    margin: float | None = None
    revenueGrowth: float | None = None
    returnYtd: float | None = None


class Company(BaseModel):
    profile: CompanyProfile
    quote: TickerQuote
    annual: list[AnnualFinancials]
    valuation: list[ValuationPoint]
    segments: list[SegmentBreakdownPoint]
    quarterly: dict[str, list[QuarterlyResult]]
    riskFactors: list[RiskPoint]
    managementDiscussion: str
    documents: list[FinancialDocument]
    # {"mode": "live" | "legacy", "asOf": ..., "sources": [...], "unavailable": [...]}
    provenance: dict[str, object] | None = None


class CompanySummary(BaseModel):
    slug: str
    ticker: str
    name: str
    sector: str
    exchange: str
    currency: str
    website: str | None = None
    marketCap: float
    price: float
    changePct: float
    peRatio: float
    roe: float | None = None
    revenueGrowth: float | None = None
    # False for a universe-only match whose figures have not been fetched yet.
    liveData: bool = True


class MarketIndex(BaseModel):
    ticker: str
    name: str
    # A level or move that could not be sourced stays None; the UI renders "—".
    # Never default a missing market number to zero.
    value: float | None = None
    changePct: float | None = None
    # Market time reported by the source, and the time InvestIQ last fetched it.
    asOf: str | None = None
    fetchedAt: str | None = None
    source: str | None = None
    # True when the last successful fetch is older than the index TTL.
    stale: bool = False


class Watchlist(BaseModel):
    id: str
    name: str
    color: str
    symbols: list[str]
    updatedAt: str


class NotificationItem(BaseModel):
    id: str
    type: NotificationType
    title: str
    message: str
    time: str
    read: bool = False
    # Optional provenance: lets the UI deep-link to a company and show the real
    # upstream source. Absent for legacy fixtures, never invented.
    slug: str | None = None
    source: str | None = None


class SearchResult(BaseModel):
    query: str
    hits: list[Citation] = Field(default_factory=list)


class SearchQuery(BaseModel):
    query: str
    limit: int = Field(default=10, ge=1, le=50)
    company: str | None = None


class DataStore(ABC):
    """Read boundary used by the API layer. Writes are handled by workers."""

    @abstractmethod
    async def list_companies(self) -> list[CompanySummary]:
        """Every company as a slim summary (sorted by market cap desc)."""

    @abstractmethod
    async def get_company(self, slug: str) -> Company | None:
        """Full company payload by slug, or None when unknown."""

    @abstractmethod
    async def search_companies(self, q: str, limit: int = 8) -> list[CompanySummary]:
        """Fuzzy/slug/ticker search across companies."""

    @abstractmethod
    async def get_peer_group(self, slug: str, limit: int = 6) -> list[PeerCompany]:
        """Sector peers with comparative metrics."""

    @abstractmethod
    async def get_market_indices(self) -> list[MarketIndex]:
        """Headline market indices."""

    @abstractmethod
    async def semantic_search(self, query: SearchQuery) -> SearchResult:
        """Vector similarity search over document chunks with citations."""

    @abstractmethod
    async def get_documents(self, slug: str) -> list[FinancialDocument]:
        """Documents filed for a company (most recent first)."""

    @abstractmethod
    async def get_document_chunks(self, document_id: str) -> list[DocumentChunk]:
        """Chunks belonging to a single document."""

    @abstractmethod
    async def get_watchlists(self) -> list[Watchlist]:
        """All watchlists for the current user."""

    @abstractmethod
    async def get_notifications(self) -> list[NotificationItem]:
        """Notification feed for the current user."""