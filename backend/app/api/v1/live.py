"""Live-data endpoints backed by Yahoo Finance, Screener.in and other real sources.

Fresh cache entries are served directly; stale entries are refreshed on
demand. If a live fetch fails, the freshest cached values are returned with
``stale: true`` and an ``error`` string. No endpoint ever fabricates values.
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.deps import get_store
from app.data import alternate_sources as alt
from app.data import live_sources as live
from app.data import nse_universe as universe
from app.data.contract import DataStore

router = APIRouter()

QUOTE_SOURCE = live.QUOTE_SOURCE
COMPANY_SOURCE = live.COMPANY_SOURCE
COMPARE_SOURCE = f"{QUOTE_SOURCE} + {COMPANY_SOURCE}"


class LiveSearchQuery(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    limit: int = Field(default=8, ge=1, le=20)
    company: str | None = None


def _normalize_ticker(ticker: str) -> str:
    return ticker.strip().upper().removesuffix(".NS")


def _slug_for_ticker(ticker: str) -> str | None:
    symbol = _normalize_ticker(ticker)
    return next((slug for slug, (yahoo, _) in live.UNIVERSE.items() if yahoo == symbol), None)


def _with_fallback(body: dict[str, Any], stale: bool, error: str | None) -> dict[str, Any]:
    if stale:
        body["stale"] = True
    if error:
        body["error"] = error
    return body


def _merge_news(*groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Combine real citations from several sources, deduped by URL, newest first."""
    seen: set[str] = set()
    merged: list[dict[str, Any]] = []
    for group in groups:
        for item in group or []:
            url = str(item.get("url") or "")
            if not url or url in seen:
                continue
            seen.add(url)
            merged.append(item)
    merged.sort(key=lambda item: str(item.get("publishedAt") or ""), reverse=True)
    return merged


def _quote_body(ticker: str, quote: dict[str, Any], *, stale: bool = False, error: str | None = None) -> dict[str, Any]:
    return _with_fallback(
        {
            "ticker": ticker,
            "price": quote.get("price"),
            "changePct": quote.get("changePct"),
            "previousClose": quote.get("previousClose"),
            "dayHigh": quote.get("dayHigh"),
            "dayLow": quote.get("dayLow"),
            "volume": quote.get("volume"),
            "fiftyTwoWeekHigh": quote.get("fiftyTwoWeekHigh"),
            "fiftyTwoWeekLow": quote.get("fiftyTwoWeekLow"),
            "currency": quote.get("currency"),
            "asOf": quote.get("asOf"),
            "source": QUOTE_SOURCE,
        },
        stale,
        error,
    )


def _profile_body(
    slug: str, profile: dict[str, Any], *, stale: bool = False, error: str | None = None
) -> dict[str, Any]:
    return _with_fallback(
        {
            "slug": slug,
            "name": profile.get("name"),
            "about": profile.get("about"),
            "marketCapCr": profile.get("marketCapCr"),
            "price": profile.get("price"),
            "peRatio": profile.get("peRatio"),
            "bookValue": profile.get("bookValue"),
            "dividendYield": profile.get("dividendYield"),
            "roce": profile.get("roce"),
            "roe": profile.get("roe"),
            "pros": profile.get("pros") or [],
            "cons": profile.get("cons") or [],
            "citations": profile.get("citations") or [],
            "asOf": profile.get("asOf"),
            "source": COMPANY_SOURCE,
        },
        stale,
        error,
    )


def _discovered_summary(entry: dict[str, Any]) -> dict[str, Any]:
    """Shape a discovered cache entry like a company summary, keeping nulls null."""
    quote_data = entry.get("quote") if isinstance(entry.get("quote"), dict) else {}
    price = quote_data.get("price")
    change = quote_data.get("changePct")
    return {
        "slug": entry.get("slug"),
        "ticker": entry.get("ticker"),
        "name": entry.get("name"),
        "sector": "",
        "exchange": entry.get("exchange") or "",
        "currency": entry.get("currency") or "",
        "website": None,
        "marketCap": None,
        "price": price if isinstance(price, (int, float)) else None,
        "changePct": change if isinstance(change, (int, float)) else None,
        "peRatio": None,
        "roe": None,
        "revenueGrowth": None,
        "source": QUOTE_SOURCE,
        "available": isinstance(price, (int, float)),
    }


@router.get("/universe")
async def universe_info() -> dict[str, Any]:
    """Coverage summary for the full NSE domestic-equity universe."""
    return {**universe.meta(), "sourceDetail": "NSE India EQUITY_L.csv (official master list)"}


@router.get("/symbols")
async def symbols(q: str = Query(..., min_length=1, max_length=100), limit: int = Query(12, ge=1, le=50)) -> dict[str, Any]:
    """Instant local lookup across every NSE-listed domestic equity."""
    return {"query": q, "count": len(universe.search(q, limit)), "companies": universe.search(q, limit)}


@router.get("/discover")
async def discover(
    q: str = Query(..., min_length=2, max_length=100),
    limit: int = Query(8, ge=1, le=20),
    store: DataStore = Depends(get_store),
) -> dict[str, Any]:
    """Best-effort lookup for companies outside the built-in universe.

    Local coverage is checked first (free, instant). Only when it has no match
    do we call Yahoo Finance's keyless symbol search, persist the result on
    disk and register any company we fetched a real quote for. Upstream
    failures return an empty result with an ``error`` — never a guess.
    """
    local = await store.search_companies(q, limit)
    if local:
        return {
            "companies": [item.model_dump() for item in local],
            "resolved": True,
            "cached": True,
            "source": "InvestIQ universe",
            "query": q,
        }

    result = await live.resolve_company(q, limit)
    raw = result.get("companies") or []
    if raw:
        result["companies"] = [
            item if "marketCap" in item or "price" in item else _discovered_summary(item)
            for item in raw
        ]
        sync = getattr(store, "sync_live", None) or getattr(store, "sync_discovered", None)
        if callable(sync):
            sync()
    return result


@router.get("/quote/{ticker}")
async def quote(ticker: str) -> dict[str, Any]:
    symbol = _normalize_ticker(ticker)
    if not symbol:
        raise HTTPException(status_code=400, detail="A ticker symbol is required")

    cache = live.get_cached()
    quotes = cache.get("quotes") or {}
    if live.is_fresh(cache.get("savedAt")) and symbol in quotes:
        return _quote_body(symbol, quotes[symbol])

    try:
        fresh = await live.fetch_quote(symbol)
    except Exception as exc:  # noqa: BLE001 - any failure must fall back to cache
        cached = quotes.get(symbol)
        if cached is None:
            raise HTTPException(
                status_code=502, detail=f"Live quote unavailable and no cached data for {symbol}: {exc}"
            ) from exc
        return _quote_body(symbol, cached, stale=True, error=str(exc))

    quotes[symbol] = fresh
    live.save_cached({**cache, "quotes": quotes})
    return _quote_body(symbol, fresh)


@router.get("/profile/{slug}")
async def profile(slug: str) -> dict[str, Any]:
    key = slug.strip().lower()
    cache = live.get_cached()
    profiles = cache.get("profiles") or {}
    if live.is_fresh(cache.get("savedAt")) and key in profiles:
        return _profile_body(key, profiles[key])

    try:
        fresh = await live.fetch_profile(key)
    except Exception as exc:  # noqa: BLE001 - any failure must fall back to cache
        cached = profiles.get(key)
        if cached is None:
            status = 404 if key not in live.UNIVERSE else 502
            raise HTTPException(
                status_code=status, detail=f"Live profile unavailable and no cached data for {key}: {exc}"
            ) from exc
        return _profile_body(key, cached, stale=True, error=str(exc))

    profiles[key] = fresh
    live.save_cached({**cache, "profiles": profiles})
    return _profile_body(key, fresh)


@router.post("/search")
async def search(body: LiveSearchQuery) -> dict[str, Any]:
    cache = live.get_cached()
    profiles = cache.get("profiles") or {}
    stale, error = False, None

    if not live.is_fresh(cache.get("savedAt")) or not profiles:
        try:
            cache = await live.refresh()
            profiles = cache.get("profiles") or {}
        except Exception as exc:  # noqa: BLE001 - serve cached evidence on failure
            if not profiles:
                raise HTTPException(status_code=502, detail=f"Live search data unavailable: {exc}") from exc
            stale, error = True, str(exc)

    evidence = live.build_evidence(profiles)
    if body.company:
        wanted = body.company.strip().lower()
        evidence = [
            item for item in evidence
            if wanted in str(item.get("company", "")).lower() or wanted in str(item.get("slug", "")).lower()
        ]
    hits = live.search_evidence(evidence, body.query, limit=body.limit)

    # Real, clickable headlines from independent news sources. Best-effort: a
    # query with no coverage simply contributes no citations, never invented ones.
    news: list[dict[str, Any]] = []
    news_error: str | None = None
    try:
        yahoo_news = await live.fetch_news(body.query, limit=5)
        google_news = await alt.fetch_google_news(body.query, limit=5)
        news = _merge_news(yahoo_news, google_news)[:8]
    except Exception as exc:  # noqa: BLE001 - news is optional enrichment
        news_error = str(exc)

    body_response = {
        "query": body.query,
        "hits": hits,
        "news": news,
        "newsSource": "Yahoo Finance News + Google News",
        "asOf": cache.get("savedAt"),
        "source": COMPANY_SOURCE,
    }
    if news_error:
        body_response["newsError"] = news_error
    return _with_fallback(body_response, stale, error)


@router.get("/news")
async def news(
    q: str = Query(..., min_length=2, max_length=100),
    limit: int = Query(6, ge=1, le=10),
    ticker: str | None = Query(default=None, max_length=30),
) -> dict[str, Any]:
    """Real, clickable news from Yahoo Finance, Google News and NSE filings."""
    try:
        yahoo_news = await live.fetch_news(q, limit)
        google_news = await alt.fetch_google_news(q, limit)
        nse_items: list[dict[str, Any]] = []
        symbol = (ticker or "").strip()
        if symbol:
            nse_items = await alt.fetch_nse_announcements(symbol, limit)
        items = _merge_news(yahoo_news, google_news, nse_items)[: max(limit, 6)]
        return {
            "query": q,
            "items": items,
            "source": "Yahoo Finance News + Google News + NSE Announcements",
        }
    except Exception as exc:  # noqa: BLE001 - normalized upstream error
        raise HTTPException(status_code=502, detail=f"Live news unavailable: {exc}") from exc


@router.get("/company-extras/{slug}")
async def company_extras(slug: str) -> dict[str, Any]:
    """Non-Yahoo company intelligence: Wikipedia background and NSE filings."""
    key = slug.strip().lower()
    cache = live.get_cached()
    entry = live.discovered_entry_for(key)
    if key in live.UNIVERSE:
        ticker, name = live.UNIVERSE[key][0], live.UNIVERSE[key][0].replace("-", " ").title()
    elif entry:
        ticker = str(entry.get("ticker") or "")
        name = str(entry.get("name") or "")
    else:
        ticker, name = "", key.replace("-", " ")
    profile = (cache.get("profiles") or {}).get(key) or {}
    company_name = str(profile.get("name") or name or ticker or key)
    wikipedia, announcements = await asyncio.gather(
        alt.fetch_wikipedia_summary(company_name.replace("Limited", "").strip()),
        alt.fetch_nse_announcements(ticker, limit=6) if ticker else _empty_list(),
    )
    return {
        "slug": key,
        "ticker": ticker,
        "wikipedia": wikipedia,
        "announcements": announcements,
        "sources": [alt.WIKIPEDIA_SOURCE, alt.NSE_SOURCE],
    }


async def _empty_list() -> list[Any]:
    return []


@router.get("/compare")
async def compare(
    symbols: str = Query(..., min_length=1, description="Comma-separated ticker symbols (up to 6)"),
) -> dict[str, Any]:
    requested = [symbol.strip().upper().removesuffix(".NS") for symbol in symbols.split(",") if symbol.strip()]
    if not requested:
        raise HTTPException(status_code=400, detail="Provide at least one ticker symbol")

    tickers: list[str] = []
    for symbol in requested:
        if symbol not in tickers:
            tickers.append(symbol)
    tickers = tickers[:6]

    cache = live.get_cached()
    quotes = cache.get("quotes") or {}
    profiles = cache.get("profiles") or {}
    stale, error = False, None

    if not live.is_fresh(cache.get("savedAt")):
        try:
            cache = await live.refresh()
            quotes = cache.get("quotes") or {}
            profiles = cache.get("profiles") or {}
        except Exception as exc:  # noqa: BLE001 - fall back to cached values
            stale, error = True, str(exc)

    items: list[dict[str, Any]] = []
    failures: list[str] = []
    for ticker in tickers:
        quote_data = quotes.get(ticker)
        if quote_data is None:
            try:
                quote_data = await live.fetch_quote(ticker)
                quotes[ticker] = quote_data
            except Exception as exc:  # noqa: BLE001
                failures.append(f"{ticker}: {exc}")
                continue

        slug = _slug_for_ticker(ticker) or ""
        profile_data = profiles.get(slug)
        if slug and profile_data is None:
            try:
                profile_data = await live.fetch_profile(slug)
                profiles[slug] = profile_data
            except Exception as exc:  # noqa: BLE001
                failures.append(f"{slug}: {exc}")

        items.append({
            "ticker": ticker,
            "name": (profile_data or {}).get("name") or quote_data.get("name"),
            "price": quote_data.get("price"),
            "changePct": quote_data.get("changePct"),
            "peRatio": (profile_data or {}).get("peRatio"),
            "roe": (profile_data or {}).get("roe"),
            "marketCapCr": (profile_data or {}).get("marketCapCr"),
            "asOf": quote_data.get("asOf") or cache.get("savedAt"),
        })

    if failures:
        stale = True
        detail = "; ".join(failures)
        error = f"{error}; {detail}" if error else detail
    if quotes or profiles:
        cache = live.save_cached({**cache, "quotes": quotes, "profiles": profiles})

    return _with_fallback(
        {
            "items": items,
            "asOf": cache.get("savedAt"),
            "source": COMPARE_SOURCE,
        },
        stale,
        error,
    )


@router.get("/status")
async def status() -> dict[str, Any]:
    cache = live.get_cached()
    quotes = cache.get("quotes") or {}
    profiles = cache.get("profiles") or {}
    return {
        "cached": bool(cache.get("savedAt") and (quotes or profiles)),
        "savedAt": cache.get("savedAt"),
        "companies": len(profiles),
        "evidenceCount": len(live.build_evidence(profiles)),
        "sources": list(live.SOURCES),
        "universe": universe.meta(),
        "nationalSources": list(alt.SOURCES) if hasattr(alt, "SOURCES") else [alt.GOOGLE_NEWS, alt.NSE_SOURCE, alt.WIKIPEDIA_SOURCE],
    }
