"""Offline, file-backed :class:`DataStore` implementation.

Reads pydantic models straight from JSON fixture files produced by a sibling
generator agent. Fully functional with no database and no external services;
semantic search degrades to a deterministic lexical scorer when embeddings or
the LM Studio endpoint are unavailable.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Callable, Sequence

import httpx

from app.core.config import Settings, get_settings
from app.data import live_sources
from app.data.contract import (
    Citation,
    Company,
    CompanySummary,
    DataStore,
    DocumentChunk,
    FinancialDocument,
    MarketIndex,
    NotificationItem,
    PeerCompany,
    SearchQuery,
    SearchResult,
    Watchlist,
)
from app.data.live_sources import get_cached
from app.data.notification_feed import build_notifications
from app.data.reconcile import build_company

_TOKEN_RE = re.compile(r"[a-z0-9]+")
_YEAR_DIGITS_RE = re.compile(r"\d+")


def _tokenize(text: str) -> set[str]:
    return set(_TOKEN_RE.findall(text.lower()))


def _year_key(value: str) -> int:
    match = _YEAR_DIGITS_RE.search(value)
    return int(match.group()) if match else 0


def _as_float(value) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number and number not in (float("inf"), float("-inf")) else None


def _default_embedder(settings: Settings) -> Callable[[str], list[float] | None]:
    """Call the LM Studio embeddings endpoint, returning ``None`` when unreachable."""

    def embed(text: str) -> list[float] | None:
        url = f"{settings.lm_studio_url.rstrip('/')}/v1/embeddings"
        try:
            response = httpx.post(
                url,
                json={"model": settings.embedding_model, "input": text},
                timeout=3.0,
            )
            response.raise_for_status()
            data = response.json()
            return data["data"][0]["embedding"]
        except Exception:
            return None

    return embed


class OfflineDataStore(DataStore):
    """Reads all data from a fixtures directory at construction time."""

    def __init__(
        self,
        settings: Settings | str | Path | None = None,
        embed: Callable[[str], list[float] | None] | None = None,
        live_cache: dict | None = None,
    ) -> None:
        if isinstance(settings, (str, Path)):
            fixtures_dir = str(settings)
            self._settings = get_settings()
        elif settings is not None:
            self._settings = settings
            fixtures_dir = settings.fixtures_dir
        else:
            self._settings = get_settings()
            fixtures_dir = self._settings.fixtures_dir
        self.embed = embed or _default_embedder(self._settings)

        fixtures = Path(fixtures_dir)
        self._companies: dict[str, Company] = self._load_companies(fixtures / "companies")
        self._live_cache: dict = live_cache if live_cache is not None else get_cached()
        self._reconcile_live()
        self._indices: list[MarketIndex] = self._load_indices()
        self._watchlists: list[Watchlist] = self._load_model_list(fixtures / "watchlists.json", Watchlist)
        # Notifications are derived from the live snapshot, never from a static
        # fixture — stale dates and invented events are no longer possible.
        self._notifications: list[NotificationItem] = build_notifications(self._live_cache)
        self._chunks: list[DocumentChunk] = self._load_model_list(fixtures / "chunks.json", DocumentChunk)
        self._embeddings: dict[str, list[float]] = self._load_embeddings(fixtures / "embeddings.json")
        self._sync_documents_and_chunks()
        self._sync_discovered()

    def _build_discovered_company(self, slug: str, entry: dict) -> Company | None:
        """Materialise a discovered company from its cached real quote."""
        ticker = str(entry.get("ticker") or "").upper()
        quote = entry.get("quote") if isinstance(entry.get("quote"), dict) else None
        if not ticker or not quote:
            return None
        short = ticker.removesuffix(".NS").removesuffix(".BO")
        as_of = str(entry.get("resolvedAt") or self._live_cache.get("savedAt") or "")
        # Use any real Screener profile we fetched for this discovered company.
        profile = None
        cache = self._live_cache if isinstance(self._live_cache, dict) else {}
        cached_profiles = cache.get("profiles") if isinstance(cache.get("profiles"), dict) else {}
        if isinstance(cached_profiles.get(slug), dict):
            profile = cached_profiles[slug]
        # Key the quote by both the full and short ticker: reconcile looks up
        # the short symbol derived from the slug.
        # reconcile looks up the quote by the uppercase slug and by the raw
        # ticker; discovered tickers can contain punctuation (e.g. M&M.NS).
        synthetic = {
            "savedAt": as_of,
            "quotes": {ticker: quote, short: quote, slug.upper(): quote},
            "profiles": {slug: profile} if profile else {},
        }
        company = build_company(slug, synthetic)
        if company is None:
            return None
        company.profile.name = str(entry.get("name") or company.profile.name)
        company.profile.ticker = ticker
        company.profile.exchange = str(entry.get("exchange") or "")
        company.profile.currency = str(entry.get("currency") or company.profile.currency)
        sources = [live_sources.QUOTE_SOURCE]
        unavailable = ["fundamentals", "financials", "documents", "ratios"]
        if profile:
            sources.append(live_sources.COMPANY_SOURCE)
            unavailable = []
        company.provenance = {
            "mode": "live",
            "asOf": as_of,
            "sources": sources,
            "unavailable": unavailable,
        }
        return company

    def _sync_discovered(self) -> None:
        """Add on-demand discovered companies that have a real cached quote."""
        discovered = self._live_cache.get("discovered") if isinstance(self._live_cache, dict) else None
        if not isinstance(discovered, dict):
            return
        for key, entry in discovered.items():
            if not isinstance(entry, dict):
                continue
            slug = str(key).strip().lower()
            if not slug or slug in live_sources.UNIVERSE:
                continue
            company = self._build_discovered_company(slug, entry)
            if company is not None:
                self._companies[slug] = company

    def sync_discovered(self) -> int:
        """Public hook for the discovery endpoint; returns the discovered count."""
        return self.sync_live()

    def sync_live(self) -> int:
        """Reload the live cache and rebuild all companies from real data.

        Unlike ``sync_discovered`` this also reconciles the universe and any
        newly fetched discovered profiles, so fundamentals appear as soon as a
        source responds.
        """
        self._live_cache = live_sources.get_cached()
        before = len(self._companies)
        self._reconcile_live()
        self._sync_discovered()
        return len(self._companies) - before

    def _reconcile_live(self) -> None:
        """Replace legacy companies that have live data; label the rest legacy."""
        cache = self._live_cache if isinstance(self._live_cache, dict) else {}
        profiles = cache.get("profiles") if isinstance(cache.get("profiles"), dict) else {}
        quotes = cache.get("quotes") if isinstance(cache.get("quotes"), dict) else {}
        ticker_to_slug = {ticker.upper(): slug for slug, (ticker, _) in live_sources.UNIVERSE.items()}
        slugs = set(self._companies) | {str(key).strip().lower() for key in profiles}
        slugs |= {
            ticker_to_slug[str(ticker).upper()]
            for ticker in quotes
            if str(ticker).upper() in ticker_to_slug
        }
        discovered = cache.get("discovered") if isinstance(cache.get("discovered"), dict) else {}
        for slug in slugs:
            built = build_company(slug, cache, self._companies.get(slug))
            if built is not None:
                entry = discovered.get(slug)
                if isinstance(entry, dict) and entry.get("ticker"):
                    # Keep the real exchange ticker (e.g. M&M.NS), not a slug guess.
                    built.profile.ticker = str(entry["ticker"]).upper()
                self._companies[slug] = built
        for company in self._companies.values():
            if company.provenance is None:
                company.provenance = {"mode": "legacy"}

    def _load_indices(self) -> list[MarketIndex]:
        # The checked-in indices.json was synthetic and is no longer a fallback:
        # only real, sourced levels from the live snapshot reach the API.
        indices = self._live_cache.get("indices") if isinstance(self._live_cache, dict) else None
        return [MarketIndex(**item) for item in live_sources.index_payloads({"indices": indices or {}})]

    def _sync_documents_and_chunks(self) -> None:
        """Keep the document index and search chunks aligned with active companies."""
        self._documents_by_id: dict[str, FinancialDocument] = {
            doc.id: doc for company in self._companies.values() for doc in company.documents
        }
        if not self._chunks:
            self._chunks = self._document_chunks()
            return
        live_ids = set(self._documents_by_id)
        self._chunks = [chunk for chunk in self._chunks if chunk.documentId in live_ids]
        covered = {chunk.documentId for chunk in self._chunks}
        for doc in self._documents_by_id.values():
            if doc.id in covered:
                continue
            text = " ".join(part for part in (doc.title, doc.form, doc.fiscalPeriod, doc.sourceUrl) if part)
            self._chunks.append(
                DocumentChunk(id=f"{doc.id}-chunk", documentId=doc.id, page=1, section="", text=text)
            )

    def _document_chunks(self) -> list[DocumentChunk]:
        chunks: list[DocumentChunk] = []
        for company in self._companies.values():
            for doc in company.documents:
                text = (
                    f"{doc.title} {doc.form} {doc.fiscalPeriod} "
                    f"{company.profile.name} {company.profile.sector} {company.profile.industry}"
                )
                chunks.append(
                    DocumentChunk(id=doc.id, documentId=doc.id, page=1, section="", text=text.strip())
                )
        return chunks

    @staticmethod
    def _load_companies(companies_dir: Path) -> dict[str, Company]:
        companies: dict[str, Company] = {}
        if not companies_dir.is_dir():
            return companies
        for file in sorted(companies_dir.glob("*.json")):
            try:
                company = Company.model_validate_json(file.read_text(encoding="utf-8"))
                companies[company.profile.slug] = company
            except Exception:
                continue
        return companies

    @staticmethod
    def _load_model_list(path: Path, model: type) -> list:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return []
        if not isinstance(payload, list):
            return []
        return [model.model_validate(item) for item in payload]

    @staticmethod
    def _load_embeddings(path: Path) -> dict[str, list[float]]:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return {}
        if not isinstance(payload, dict):
            return {}
        return {str(key): list(value) for key, value in payload.items()}

    @staticmethod
    def _latest_annual(company: Company):
        annual = sorted(company.annual, key=lambda a: _year_key(a.year), reverse=True)
        return annual[0] if annual else None

    def _summary(self, company: Company) -> CompanySummary:
        annual = self._latest_annual(company)
        return CompanySummary(
            slug=company.profile.slug,
            ticker=company.profile.ticker,
            name=company.profile.name,
            sector=company.profile.sector,
            exchange=company.profile.exchange,
            currency=company.profile.currency,
            website=company.profile.website or None,
            marketCap=company.quote.marketCap,
            price=company.quote.price,
            changePct=company.quote.changePct,
            peRatio=company.quote.peRatio,
            roe=annual.roe if annual else None,
            revenueGrowth=annual.revenueGrowth if annual else None,
        )

    def _sorted_summaries(self, companies: Sequence[Company]) -> list[CompanySummary]:
        return sorted(
            (self._summary(c) for c in companies),
            key=lambda s: s.marketCap if s.marketCap is not None else float("-inf"),
            reverse=True,
        )

    def _peer(self, company: Company) -> PeerCompany:
        annual = self._latest_annual(company)
        return PeerCompany(
            slug=company.profile.slug,
            ticker=company.profile.ticker,
            name=company.profile.name,
            marketCap=company.quote.marketCap,
            peRatio=company.quote.peRatio,
            roe=annual.roe if annual else None,
            margin=annual.netMargin if annual else None,
            revenueGrowth=annual.revenueGrowth if annual else None,
            returnYtd=company.quote.changePct,
        )

    async def list_companies(self) -> list[CompanySummary]:
        return self._sorted_summaries(self._companies.values())

    async def get_company(self, slug: str) -> Company | None:
        return self._companies.get(slug)

    async def search_companies(self, q: str, limit: int = 8) -> list[CompanySummary]:
        needle = q.strip().lower()
        if not needle:
            return self._sorted_summaries(self._companies.values())[:limit]
        matched = [
            c
            for c in self._companies.values()
            if needle in c.profile.slug.lower()
            or needle in c.profile.ticker.lower()
            or needle in c.profile.name.lower()
        ]
        return self._sorted_summaries(matched)[:limit]

    async def get_peer_group(self, slug: str, limit: int = 6) -> list[PeerCompany]:
        company = self._companies.get(slug)
        if company is None:
            return []
        peers = [
            c
            for c in self._companies.values()
            if c.profile.slug != slug and c.profile.sector == company.profile.sector
        ]
        peers.sort(key=lambda c: c.quote.marketCap, reverse=True)
        return [self._peer(c) for c in peers[:limit]]

    async def get_market_indices(self) -> list[MarketIndex]:
        return self._indices

    async def semantic_search(self, query: SearchQuery) -> SearchResult:
        query_vec = self.embed(query.query)
        if query_vec is not None and self._chunks and self._embeddings:
            hits = self._vector_hits(query_vec, query.limit)
        else:
            hits = self._lexical_hits(query.query, query.limit)
        return SearchResult(query=query.query, hits=hits)

    def _embedding_for(self, chunk: DocumentChunk) -> list[float] | None:
        return self._embeddings.get(chunk.id) or self._embeddings.get(f"{chunk.documentId}:{chunk.id}")

    def _vector_hits(self, query_vec: list[float], limit: int) -> list[Citation]:
        scored: list[tuple[float, DocumentChunk]] = []
        for chunk in self._chunks:
            vector = self._embedding_for(chunk)
            if vector is None:
                continue
            score = self._cosine(query_vec, vector)
            scored.append((score, chunk))
        scored.sort(key=lambda pair: pair[0], reverse=True)
        return [self._citation(chunk, score) for score, chunk in scored[:limit]]

    def _lexical_hits(self, query: str, limit: int) -> list[Citation]:
        query_tokens = _tokenize(query)
        if not query_tokens or not self._chunks:
            return []
        scored: list[tuple[int, str, DocumentChunk]] = []
        for chunk in self._chunks:
            chunk_tokens = _tokenize(chunk.text)
            overlap = len(query_tokens & chunk_tokens)
            if overlap > 0:
                scored.append((overlap, chunk.id, chunk))
        scored.sort(key=lambda pair: (pair[0], pair[1]), reverse=True)
        return [self._citation(chunk, float(score)) for score, _, chunk in scored[:limit]]

    @staticmethod
    def _cosine(a: Sequence[float], b: Sequence[float]) -> float:
        if not a or not b or len(a) != len(b):
            return 0.0
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = sum(x * x for x in a) ** 0.5
        norm_b = sum(y * y for y in b) ** 0.5
        if norm_a == 0.0 or norm_b == 0.0:
            return 0.0
        return dot / (norm_a * norm_b)

    def _citation(self, chunk: DocumentChunk, score: float) -> Citation:
        doc = self._documents_by_id.get(chunk.documentId)
        return Citation(
            id=chunk.id,
            documentId=chunk.documentId,
            title=doc.title if doc else "Document",
            source=doc.source if doc else "Document",
            page=chunk.page,
            snippet=chunk.text[:160],
            score=score,
            url=doc.sourceUrl if doc else None,
        )

    async def get_documents(self, slug: str) -> list[FinancialDocument]:
        company = self._companies.get(slug)
        if company is None:
            return []
        return sorted(company.documents, key=lambda d: d.filedDate or "", reverse=True)

    async def get_document_chunks(self, document_id: str) -> list[DocumentChunk]:
        return [chunk for chunk in self._chunks if chunk.documentId == document_id]

    async def get_watchlists(self) -> list[Watchlist]:
        return self._watchlists

    async def get_notifications(self) -> list[NotificationItem]:
        return self._notifications