"""Live real-data layer for InvestIQ.

Fetches quotes from Yahoo Finance and company fundamentals/citations from
Screener.in, with a small on-disk cache. Parsing helpers are pure functions
so they can be exercised with sample payloads without any network access.

No financial number is ever invented: a field that cannot be parsed is
returned as ``None`` and omitted from readable text.
"""

from __future__ import annotations

import asyncio
import html
import json
import math
import os
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import quote

import httpx

# --- Constants -----------------------------------------------------------

USER_AGENT = "Mozilla/5.0 (compatible; InvestIQ/1.0; research demo)"
HTTP_TIMEOUT = 10.0
YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=1mo&interval=1d"
# Lightweight, keyless symbol search used only when a company is not in the
# built-in universe. Results are cached on disk, so repeated lookups are free.
YAHOO_SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search"
SCREENER_URL = "https://www.screener.in/company/{symbol}/consolidated/"
MAX_DISCOVERED = 40
QUOTE_SOURCE = "Yahoo Finance"
COMPANY_SOURCE = "Screener.in / issuer filings"
SOURCES = [QUOTE_SOURCE, COMPANY_SOURCE]

CACHE_PATH = Path(__file__).resolve().parents[1] / "fixtures" / "live_cache.json"
DEFAULT_CACHE_TTL_SECONDS = 1800

# slug -> (Yahoo ticker, Screener.in symbol)
UNIVERSE: dict[str, tuple[str, str]] = {
    "reliance": ("RELIANCE", "RELIANCE"),
    "tcs": ("TCS", "TCS"),
    "infosys": ("INFY", "INFY"),
    "wipro": ("WIPRO", "WIPRO"),
    "hdfc-bank": ("HDFCBANK", "HDFCBANK"),
    "icici-bank": ("ICICIBANK", "ICICIBANK"),
    "state-bank-of-india": ("SBIN", "SBIN"),
    "itc": ("ITC", "ITC"),
    "hindustan-unilever": ("HINDUNILVR", "HINDUNILVR"),
    "tata-motors": ("TATAMOTORS", "TATAMOTORS"),
    "bharti-airtel": ("BHARTIARTL", "BHARTIARTL"),
    "asian-paints": ("ASIANPAINT", "ASIANPAINT"),
}

# Headline Indian market indices served by the Yahoo chart API. These symbols
# are already exchange codes (caret-prefixed) and must never get a ".NS" suffix.
INDEX_SYMBOLS: dict[str, str] = {
    "^NSEI": "NIFTY 50",
    "^BSESN": "SENSEX",
    "^NSEBANK": "NIFTY BANK",
}

# Screener.in annual statement table container ids (Rs. Crores, one column per year).
_FINANCIAL_TABLE_IDS = ("profit-loss", "balance-sheet", "cash-flow", "ratios")


class LiveDataError(RuntimeError):
    """Raised when a live fetch or its parsing fails; callers fall back to cache."""


# --- Small pure helpers ---------------------------------------------------


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _as_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(number) or math.isinf(number) else number


def _as_int(value: Any) -> int | None:
    number = _as_float(value)
    return int(number) if number is not None else None


def _iso_from_unix(value: Any) -> str | None:
    if value is None:
        return None
    try:
        return datetime.fromtimestamp(float(value), tz=timezone.utc).isoformat()
    except (TypeError, ValueError, OSError, OverflowError):
        return None


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = html.unescape(str(value)).strip()
    return text or None


_NUMBER_RE = re.compile(r"-?\d+(?:\.\d+)?")


def _number(text: str) -> float | None:
    """Parse the first number out of text with Indian digit grouping (18,71,726).

    Accounting-style negatives in parentheses, e.g. ``(1,234.5)``, are parsed
    as negative values. Nothing is guessed when no number is present.
    """
    if not text:
        return None
    raw = html.unescape(str(text)).strip()
    negative = raw.startswith("(") and raw.endswith(")")
    match = _NUMBER_RE.search(raw.replace(",", ""))
    value = _as_float(match.group()) if match else None
    if value is None:
        return None
    return -value if negative else value


# --- Yahoo Finance quote parsing -----------------------------------------


def parse_quote(payload: dict[str, Any]) -> dict[str, Any]:
    """Parse a Yahoo chart API payload into a flat quote dict.

    Missing values are returned as ``None`` rather than guessed.
    """
    try:
        result = payload["chart"]["result"][0]
    except (KeyError, IndexError, TypeError) as exc:
        raise LiveDataError("Yahoo chart payload contains no result entry") from exc
    meta = result.get("meta")
    if not isinstance(meta, dict):
        raise LiveDataError("Yahoo chart result has no 'meta' object")

    # Yahoo's ``chartPreviousClose`` is the FIRST close in the requested range,
    # not the previous trading day. Use the penultimate daily close instead, and
    # fall back to price/changePct. Never present the range-start value as a close.
    closes = ((result.get("indicators") or {}).get("quote") or [{}])[0].get("close") or []
    previous = _as_float(closes[-2]) if len(closes) >= 2 else None
    price = _as_float(meta.get("regularMarketPrice"))
    change_pct = _as_float(meta.get("regularMarketChangePercent"))
    if previous is None and price is not None and change_pct is not None and (1 + change_pct / 100) != 0:
        previous = round(price / (1 + change_pct / 100), 2)

    return {
        "name": _clean_text(meta.get("longName") or meta.get("shortName")),
        "price": price,
        "changePct": change_pct,
        "previousClose": previous,
        "dayHigh": _as_float(meta.get("regularMarketDayHigh")),
        "dayLow": _as_float(meta.get("regularMarketDayLow")),
        "volume": _as_int(meta.get("regularMarketVolume")),
        "fiftyTwoWeekHigh": _as_float(meta.get("fiftyTwoWeekHigh")),
        "fiftyTwoWeekLow": _as_float(meta.get("fiftyTwoWeekLow")),
        "currency": _clean_text(meta.get("currency")),
        "asOf": _iso_from_unix(meta.get("regularMarketTime")),
    }


def parse_index(payload: dict[str, Any], symbol: str, name: str) -> dict[str, Any]:
    """Parse a Yahoo chart payload for a market index.

    Reuses :func:`parse_quote` for the meta extraction, but keeps the caller's
    symbol verbatim — index tickers such as ``^NSEI`` must never receive a
    ``.NS`` suffix. Missing values stay ``None``; nothing is invented.
    """
    quote_data = parse_quote(payload)
    return {
        "name": _clean_text(name),
        "symbol": _clean_text(symbol),
        "value": quote_data["price"],
        "changePct": quote_data["changePct"],
        "asOf": quote_data["asOf"],
    }


# --- Screener.in HTML parsing (stdlib only) -------------------------------


class _Element:
    __slots__ = ("tag", "classes", "ident", "attrs", "parent", "children", "parts", "href")

    def __init__(self, tag: str, attrs: dict[str, str], parent: _Element | None) -> None:
        self.tag = tag
        self.attrs = attrs
        self.classes = set((attrs.get("class") or "").split())
        self.ident = attrs.get("id")
        self.parent = parent
        self.children: list[_Element] = []
        self.parts: list[str] = []
        self.href = attrs.get("href")


class _ScreenerParser(HTMLParser):
    """Builds a lightweight element tree so text can be scoped by context."""

    _VOID = {
        "area", "base", "br", "col", "embed", "hr", "img", "input",
        "link", "meta", "param", "source", "track", "wbr",
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = _Element("[document]", {}, None)
        self._stack = [self.root]
        self.meta_description: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {key: (value or "") for key, value in attrs}
        node = _Element(tag, attributes, self._stack[-1])
        self._stack[-1].children.append(node)
        if tag == "meta" and attributes.get("name", "").lower() == "description":
            self.meta_description = attributes.get("content") or None
        if tag not in self._VOID:
            self._stack.append(node)

    def handle_endtag(self, tag: str) -> None:
        for index in range(len(self._stack) - 1, 0, -1):
            if self._stack[index].tag == tag:
                del self._stack[index:]
                return

    def handle_data(self, data: str) -> None:
        self._stack[-1].parts.append(data)


def _walk(element: _Element) -> Iterable[_Element]:
    for child in element.children:
        yield child
        yield from _walk(child)


def _find(
    element: _Element,
    *,
    tag: str | None = None,
    cls: str | None = None,
    ident: str | None = None,
) -> list[_Element]:
    return [
        node for node in _walk(element)
        if (tag is None or node.tag == tag)
        and (cls is None or cls in node.classes)
        and (ident is None or node.ident == ident)
    ]


def _element_text(element: _Element) -> str:
    """Text of a node *including descendants*.

    Screener wraps expandable row labels in ``<button>…</button>`` and citation
    markers in ``<sup><a>…</a></sup>``. Reading only ``element.parts`` dropped
    those labels entirely (e.g. "Net Profit", "Revenue"), so row values were
    silently lost. Recurse so nested text is included.
    """
    parts = list(element.parts)
    for child in element.children:
        parts.append(_element_text(child))
    return " ".join(html.unescape(" ".join(parts)).split())


def _clean_label(text: str) -> str:
    """Normalize a row/header label: unescape, collapse spaces, drop trailing '+'."""
    cleaned = html.unescape(str(text or "")).replace("\xa0", " ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return re.sub(r"\+\s*$", "", cleaned).strip()


def _fiscal_year_label(date_key: str) -> str | None:
    """Map a Screener 'YYYY-MM-DD' column key to an Indian FY label.

    The March-ending calendar year is used directly (2026-03-31 -> FY2026).
    """
    match = re.match(r"^(\d{4})-\d{2}-\d{2}$", str(date_key or "").strip())
    return f"FY{match.group(1)}" if match else None


def _parse_data_table(
    table: _Element, *, use_date_key: bool
) -> dict[str, dict[str, float | None]]:
    """Parse one Screener ``data-table`` into ``{column: {row label: value}}``.

    When ``use_date_key`` is true, column labels come from each header cell's
    ``data-date-key`` (mapped to FY labels); otherwise the header text itself
    is used (e.g. quarterly columns like "Q1 FY2026"). The first, unlabeled
    header cell is skipped in both cases. Rows are generic — no label whitelist.
    """
    heads = _find(table, tag="thead")
    header_cells = _find(heads[0], tag="th") if heads else _find(table, tag="th")

    columns: list[str] = []
    for cell in header_cells:
        if use_date_key:
            label = _fiscal_year_label(cell.attrs.get("data-date-key") or "")
        else:
            label = _clean_label(_element_text(cell))
        if label and label not in columns:
            columns.append(label)
    if not columns:
        return {}

    bodies = _find(table, tag="tbody")
    rows_source = bodies[0] if bodies else table
    parsed: dict[str, dict[str, float | None]] = {}
    for row in _find(rows_source, tag="tr"):
        cells = [cell for cell in row.children if cell.tag == "td"]
        if not cells:
            continue
        row_label = _clean_label(_element_text(cells[0]))
        if not row_label:
            continue
        for index, column in enumerate(columns):
            if index + 1 >= len(cells):
                break
            value = _number(_element_text(cells[index + 1]))
            parsed.setdefault(column, {})[row_label] = value
    return parsed


def parse_financials(markup: str, slug: str) -> dict[str, dict[str, float | None]]:
    """Harvest annual financial statements from a Screener.in page.

    Merges the P&L, balance sheet, cash flow and ratios tables into one
    ``{"FY2026": {"Revenue": <value from page>, "ROE %": <value>, ...}, ...}``
    structure.
    Missing tables are skipped. Values come only from the page: an unparsable
    cell becomes ``None`` and is never invented.
    """
    if not isinstance(markup, str) or not markup.strip():
        raise LiveDataError(f"Screener.in returned empty HTML for {slug}")

    parser = _ScreenerParser()
    try:
        parser.feed(markup)
        parser.close()
    except Exception as exc:  # noqa: BLE001 - present a single clear error type
        raise LiveDataError(f"Could not parse Screener.in HTML for {slug}: {exc}") from exc

    financials: dict[str, dict[str, float | None]] = {}
    tables_found = 0
    for table_id in _FINANCIAL_TABLE_IDS:
        for container in _find(parser.root, ident=table_id):
            tables = _find(container, tag="table")
            if not tables:
                continue
            tables_found += 1
            for year, values in _parse_data_table(tables[0], use_date_key=True).items():
                financials.setdefault(year, {}).update(values)

    if tables_found == 0:
        raise LiveDataError(f"No financial tables found for {slug}")
    return financials


_RATIO_FIELD_MAP = {
    "market cap": "marketCapCr",
    "current price": "price",
    "price": "price",
    "stock pe": "peRatio",
    "pe": "peRatio",
    "book value": "bookValue",
    "dividend yield": "dividendYield",
    "roce": "roce",
    "roe": "roe",
}


def _normalize_ratio_name(name: str) -> str:
    return " ".join(name.lower().replace(".", "").replace("/", "").split())


def parse_profile(markup: str, slug: str) -> dict[str, Any]:
    """Parse a Screener.in consolidated company page into a structured dict."""
    if not isinstance(markup, str) or not markup.strip():
        raise LiveDataError(f"Screener.in returned empty HTML for {slug}")

    parser = _ScreenerParser()
    try:
        parser.feed(markup)
        parser.close()
    except Exception as exc:  # noqa: BLE001 - present a single clear error type
        raise LiveDataError(f"Could not parse Screener.in HTML for {slug}: {exc}") from exc

    root = parser.root
    summary = _clean_text(parser.meta_description) or ""
    heading = next((text for text in (_element_text(n) for n in _find(root, tag="h1")) if text), None)
    name = heading or (summary.split("·")[0].strip() if summary else None) or slug.replace("-", " ").title()

    about_paragraphs: list[str] = []
    for container in _find(root, tag="div", cls="about"):
        for paragraph in _find(container, tag="p"):
            text = _element_text(paragraph)
            if text:
                about_paragraphs.append(text)
    about = " ".join(dict.fromkeys(about_paragraphs)) or summary

    key_points: list[dict[str, Any]] = []
    for container in _find(root, tag="div", cls="commentary"):
        for paragraph in _find(container, tag="p"):
            text = re.sub(r"\[\d+\]", "", _element_text(paragraph)).strip()
            text = " ".join(text.split())
            if not text or text.lower() in {"key points", "key insights"}:
                continue
            urls: list[str] = []
            for anchor in _find(paragraph, tag="a"):
                href = (anchor.href or "").strip()
                if href.lower().startswith(("http://", "https://")) and href not in urls:
                    urls.append(href)
            key_points.append({"text": text, "urls": urls})

    citations: list[dict[str, str]] = []
    seen_urls: set[str] = set()
    for point in key_points:
        for url in point["urls"]:
            if url in seen_urls:
                continue
            seen_urls.add(url)
            citations.append({"title": point["text"][:200], "url": url})

    def list_items(css_class: str) -> list[str]:
        texts: list[str] = []
        for container in _find(root, tag="div", cls=css_class):
            for item in _find(container, tag="li"):
                text = _element_text(item)
                if text:
                    texts.append(text)
        return list(dict.fromkeys(texts))

    pros = list_items("pros")
    cons = list_items("cons")

    top_ratios: list[dict[str, Any]] = []
    for listing in _find(root, tag="ul", ident="top-ratios"):
        for item in _find(listing, tag="li"):
            names = [_element_text(span) for span in _find(item, tag="span", cls="name")]
            numbers = [_element_text(span) for span in _find(item, tag="span", cls="number")]
            if not names or not names[0]:
                continue
            value_text = " ".join(_element_text(span) for span in _find(item, tag="span", cls="value"))
            unit = " %" if "%" in value_text else (" Cr." if re.search(r"\bCr\.?", value_text) else "")
            shown = " / ".join(number for number in numbers if number) + unit
            top_ratios.append({
                "name": names[0],
                "values": [value for value in (_number(number) for number in numbers) if value is not None],
                "text": shown,
            })

    fields: dict[str, float | None] = {
        "marketCapCr": None, "price": None, "peRatio": None, "bookValue": None,
        "dividendYield": None, "roce": None, "roe": None,
    }
    for ratio in top_ratios:
        field = _RATIO_FIELD_MAP.get(_normalize_ratio_name(ratio["name"]))
        if field and ratio["values"]:
            fields[field] = ratio["values"][0]

    try:
        financials = parse_financials(markup, slug)
    except LiveDataError:
        # A page may legitimately have no annual statement tables.
        financials = {}

    quarters: dict[str, dict[str, float | None]] = {}
    for node in _walk(root):
        if not node.ident or "quarters" not in node.ident.lower():
            continue
        tables = _find(node, tag="table", cls="data-table")
        if not tables:
            continue
        quarters = _parse_data_table(tables[0], use_date_key=False)
        if quarters:
            break

    return {
        "slug": slug,
        "name": name,
        "about": about,
        "summary": summary,
        **fields,
        "pros": pros,
        "cons": cons,
        "keyPoints": key_points,
        "citations": citations,
        "topRatios": top_ratios,
        "financials": financials,
        "quarters": quarters,
        "asOf": _now_iso(),
    }


# --- Network fetches ------------------------------------------------------


async def _get_with_retry(client: httpx.AsyncClient, url: str) -> httpx.Response:
    """GET with one bounded retry for transient transport/server errors."""
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            response = await client.get(url)
            response.raise_for_status()
            return response
        except Exception as exc:  # noqa: BLE001 - retried below, normalized by caller
            last_error = exc
            if attempt == 0:
                await asyncio.sleep(0.4)
    raise last_error  # type: ignore[misc]


async def fetch_quote(ticker: str) -> dict[str, Any]:
    """Fetch and parse a live Yahoo Finance quote. Raises ``LiveDataError``."""
    symbol = str(ticker).strip().upper()
    if not symbol:
        raise LiveDataError("A ticker symbol is required")
    if not symbol.endswith(".NS"):
        symbol = f"{symbol}.NS"
    url = YAHOO_CHART_URL.format(symbol=symbol)
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, headers={"User-Agent": USER_AGENT}) as client:
            response = await _get_with_retry(client, url)
            return parse_quote(response.json())
    except LiveDataError:
        raise
    except Exception as exc:  # noqa: BLE001 - normalize all transport errors
        raise LiveDataError(f"Yahoo Finance quote fetch failed for {symbol}: {exc}") from exc


async def fetch_profile(slug: str) -> dict[str, Any]:
    """Fetch and parse a live Screener.in company page. Raises ``LiveDataError``."""
    key = str(slug).strip().lower()
    if key not in UNIVERSE:
        raise LiveDataError(f"Unknown company slug: {slug}")
    symbol = UNIVERSE[key][1]
    url = SCREENER_URL.format(symbol=symbol)
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, headers={"User-Agent": USER_AGENT}) as client:
            response = await _get_with_retry(client, url)
            profile = parse_profile(response.text, key)
    except LiveDataError:
        raise
    except Exception as exc:  # noqa: BLE001 - normalize all transport errors
        raise LiveDataError(f"Screener.in profile fetch failed for {key}: {exc}") from exc
    if not profile["topRatios"]:
        raise LiveDataError(f"Screener.in returned no company ratios for {key}")
    return profile


async def _fetch_index(client: httpx.AsyncClient, symbol: str, name: str) -> dict[str, Any]:
    """GET one index from the Yahoo chart API and parse it (no .NS suffix)."""
    encoded = quote(symbol, safe="")
    url = YAHOO_CHART_URL.format(symbol=encoded)
    response = await _get_with_retry(client, url)
    return parse_index(response.json(), symbol, name)


async def fetch_indices() -> dict[str, dict[str, Any]]:
    """Fetch every headline index; partial results are kept on individual errors."""
    indices: dict[str, dict[str, Any]] = {}
    errors: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, headers={"User-Agent": USER_AGENT}) as client:
            for symbol, name in INDEX_SYMBOLS.items():
                try:
                    indices[symbol] = await _fetch_index(client, symbol, name)
                except Exception as exc:  # noqa: BLE001 - one bad index must not drop the rest
                    errors.append(f"{symbol}: {exc}")
    except Exception as exc:  # noqa: BLE001 - normalize transport errors
        raise LiveDataError(f"Yahoo Finance index fetch failed: {exc}") from exc

    if not indices:
        raise LiveDataError("All index fetches failed: " + "; ".join(errors[:5]))
    return indices


async def fetch_all() -> dict[str, dict[str, dict[str, Any]]]:
    """Fetch every company's quote and profile concurrently.

    Partial results are returned when some sources fail; a clear error is
    raised only when no live data at all could be retrieved.
    """
    semaphore = asyncio.Semaphore(4)

    async def guarded(task: Any) -> Any:
        async with semaphore:
            return await task

    tasks: list[tuple[str, str, Any]] = []
    for slug, (ticker, _symbol) in UNIVERSE.items():
        tasks.append(("quote", ticker, fetch_quote(ticker)))
        tasks.append(("profile", slug, fetch_profile(slug)))

    outcomes = await asyncio.gather(*(guarded(task) for _, _, task in tasks), return_exceptions=True)
    quotes: dict[str, dict[str, Any]] = {}
    profiles: dict[str, dict[str, Any]] = {}
    errors: list[str] = []
    for (kind, key, _), outcome in zip(tasks, outcomes):
        if isinstance(outcome, BaseException):
            errors.append(f"{kind}:{key}: {outcome}")
        elif kind == "quote":
            quotes[key] = outcome
        else:
            profiles[key] = outcome

    try:
        indices = await fetch_indices()
    except LiveDataError:
        indices = {}

    if not quotes and not profiles and not indices:
        raise LiveDataError("All live data fetches failed: " + "; ".join(errors[:5]))
    return {"quotes": quotes, "profiles": profiles, "indices": indices}


# --- Dynamic company discovery -------------------------------------------


def slug_from_ticker(ticker: str) -> str:
    """Stable, URL-safe slug for a discovered ticker (e.g. HDFCBANK.NS -> hdfcbank)."""
    base = str(ticker).strip().lower().removesuffix(".ns").removesuffix(".bo")
    return re.sub(r"[^a-z0-9]+", "-", base).strip("-") or "company"


def parse_search_results(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Parse Yahoo symbol search into minimal, real company candidates.

    ETFs, funds and non-equity instruments are dropped, and Indian listings
    (``.NS``/``.BO``) rank above foreign ones. Missing fields stay ``None``.
    """
    rows = payload.get("quotes") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        return []

    results: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        if not isinstance(row, dict):
            continue
        ticker = str(row.get("symbol") or "").strip().upper()
        if not ticker or ticker in seen:
            continue
        kind = str(row.get("quoteType") or "").upper()
        if kind and kind != "EQUITY":
            continue
        name = _clean_text(row.get("longname")) or _clean_text(row.get("shortname"))
        if not name:
            continue
        seen.add(ticker)
        exchange = _clean_text(row.get("exchange")) or None
        indian = ticker.endswith(".NS") or ticker.endswith(".BO") or exchange in {"NSI", "BSE"}
        results.append(
            {
                "ticker": ticker,
                "slug": slug_from_ticker(ticker),
                "name": name,
                "exchange": "NSE" if ticker.endswith(".NS") else ("BSE" if ticker.endswith(".BO") else exchange),
                "currency": _clean_text(row.get("currency")),
                "score": _as_float(row.get("score")),
                "indian": indian,
            }
        )
    results.sort(key=lambda item: (item["indian"], item["score"] or 0.0), reverse=True)
    return results


async def fetch_search(query: str, limit: int = 8) -> list[dict[str, Any]]:
    """Best-effort symbol lookup from Yahoo Finance. Raises ``LiveDataError``."""
    term = str(query).strip()
    if not term:
        return []
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, headers={"User-Agent": USER_AGENT}) as client:
            response = await _get_with_retry(
                client,
                f"{YAHOO_SEARCH_URL}?q={quote(term)}&quotesCount={max(limit * 2, 8)}&newsCount=0",
            )
            return parse_search_results(response.json())[:limit]
    except LiveDataError:
        raise
    except Exception as exc:  # noqa: BLE001 - normalize transport errors
        raise LiveDataError(f"Yahoo Finance symbol search failed for {term!r}: {exc}") from exc


def all_quotes(cache: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Quotes for the universe plus any on-demand discovered companies."""
    merged = dict(cache.get("quotes") or {})
    for entry in (cache.get("discovered") or {}).values():
        if isinstance(entry, dict) and isinstance(entry.get("quote"), dict):
            merged[str(entry.get("ticker") or "").upper()] = entry["quote"]
    return merged


def _store_discovered(cache: dict[str, Any], candidates: list[dict[str, Any]]) -> dict[str, Any]:
    """Persist a bounded set of discovered companies without dropping existing ones."""
    discovered = dict(cache.get("discovered") or {})
    now = _now_iso()
    for item in candidates:
        slug = item["slug"]
        previous = discovered.get(slug) if isinstance(discovered.get(slug), dict) else {}
        discovered[slug] = {
            "slug": slug,
            "ticker": item["ticker"],
            "name": item["name"],
            "exchange": item.get("exchange"),
            "currency": item.get("currency"),
            "resolvedAt": previous.get("resolvedAt") or now,
            # Only the candidate we actually fetched gets a quote; the rest are
            # real names/tickers that become fully priced when selected.
            "quote": previous.get("quote") or item.get("quote"),
        }
    if len(discovered) > MAX_DISCOVERED:
        keep = sorted(
            discovered.items(),
            key=lambda pair: str(pair[1].get("resolvedAt") or ""),
            reverse=True,
        )[:MAX_DISCOVERED]
        discovered = dict(keep)
    return save_cached({**cache, "discovered": discovered})


async def resolve_company(query: str, limit: int = 8) -> dict[str, Any]:
    """Resolve a search term against Yahoo Finance, caching whatever is found.

    Returns ``companies`` (real candidates), ``resolved`` (a quote was fetched),
    ``cached`` (served from the on-disk discovery cache) and an optional
    ``error``. Never fabricates a match when upstream is unreachable.
    """
    term = str(query).strip()
    if len(term) < 2:
        return {"companies": [], "resolved": False, "cached": False, "query": term}

    cache = get_cached()
    discovered = cache.get("discovered") or {}
    lowered = term.lower()
    matches = [
        entry
        for entry in discovered.values()
        if isinstance(entry, dict)
        and (
            lowered in str(entry.get("name") or "").lower()
            or lowered in str(entry.get("ticker") or "").lower()
            or lowered in str(entry.get("slug") or "").lower()
        )
    ]
    if matches:
        return {
            "companies": matches[:limit],
            "resolved": any(isinstance(item.get("quote"), dict) for item in matches),
            "cached": True,
            "query": term,
            "source": QUOTE_SOURCE,
        }

    try:
        candidates = await fetch_search(term, limit=limit)
    except LiveDataError as exc:
        return {
            "companies": matches,
            "resolved": False,
            "cached": bool(matches),
            "query": term,
            "error": str(exc),
        }

    if not candidates:
        return {"companies": [], "resolved": False, "cached": False, "query": term}

    # Fetch a real quote for the best Indian equity only — one small request.
    best = candidates[0]
    quote_data: dict[str, Any] | None = None
    try:
        quote_data = await fetch_quote(best["ticker"])
        best["quote"] = quote_data
    except LiveDataError:
        pass  # candidates are still real; their price simply stays unavailable

    _store_discovered(cache, candidates)
    return {
        "companies": candidates,
        "resolved": quote_data is not None,
        "cached": False,
        "query": term,
        "source": QUOTE_SOURCE,
    }


# --- Disk cache -----------------------------------------------------------


def cache_ttl_seconds() -> int:
    try:
        return max(0, int(os.getenv("LIVE_CACHE_TTL_SECONDS", str(DEFAULT_CACHE_TTL_SECONDS))))
    except ValueError:
        return DEFAULT_CACHE_TTL_SECONDS


def is_fresh(saved_at: str | None) -> bool:
    if not saved_at:
        return False
    try:
        saved = datetime.fromisoformat(saved_at)
    except (TypeError, ValueError):
        return False
    if saved.tzinfo is None:
        saved = saved.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - saved).total_seconds() < cache_ttl_seconds()


def _empty_cache() -> dict[str, Any]:
    return {"savedAt": None, "quotes": {}, "profiles": {}, "indices": {}, "discovered": {}}


def get_cached() -> dict[str, Any]:
    """Read the disk cache, returning an empty structure when unavailable."""
    try:
        if not CACHE_PATH.exists():
            return _empty_cache()
        data = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return _empty_cache()
        return {
            "savedAt": data.get("savedAt"),
            "quotes": data.get("quotes") or {},
            "profiles": data.get("profiles") or {},
            "indices": data.get("indices") or {},
            "discovered": data.get("discovered") or {},
        }
    except (OSError, ValueError):
        return _empty_cache()


def save_cached(cache: dict[str, Any]) -> dict[str, Any]:
    """Write the cache to disk (creating the directory) and return the payload."""
    payload = {
        "savedAt": cache.get("savedAt") or _now_iso(),
        "quotes": cache.get("quotes") or {},
        "profiles": cache.get("profiles") or {},
        "indices": cache.get("indices") or {},
        "discovered": cache.get("discovered") or {},
    }
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return payload


async def refresh() -> dict[str, Any]:
    """Fetch all live data and persist it to the cache."""
    fetched = await fetch_all()
    return save_cached({"savedAt": _now_iso(), **fetched})


# --- Evidence + search ----------------------------------------------------


def screener_url_for(slug: str) -> str:
    symbol = UNIVERSE.get(slug.lower(), (None, slug.upper()))[1]
    return SCREENER_URL.format(symbol=symbol)


def _chunk(text: str, size: int = 600) -> list[str]:
    text = " ".join((text or "").split())
    if not text:
        return []
    if len(text) <= size:
        return [text]

    chunks: list[str] = []
    current = ""
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        if len(sentence) > size:
            if current:
                chunks.append(current)
                current = ""
            buffer = ""
            for word in sentence.split():
                if buffer and len(buffer) + 1 + len(word) > size:
                    chunks.append(buffer)
                    buffer = word
                else:
                    buffer = f"{buffer} {word}".strip()
            if buffer:
                current = buffer
            continue
        if not current:
            current = sentence
        elif len(current) + 1 + len(sentence) <= size:
            current = f"{current} {sentence}"
        else:
            chunks.append(current)
            current = sentence
    if current:
        chunks.append(current)
    return chunks


def build_evidence(profiles: Any) -> list[dict[str, Any]]:
    """Turn parsed profiles into searchable evidence snippets with real URLs."""
    items = list(profiles.values()) if isinstance(profiles, dict) else list(profiles or [])
    evidence: list[dict[str, Any]] = []

    for profile in items:
        if not isinstance(profile, dict):
            continue
        slug = str(profile.get("slug") or "").strip().lower()
        company = str(profile.get("name") or slug or "Unknown company")
        page_url = screener_url_for(slug) if slug else ""

        def add(kind: str, title: str, snippet: str, url: str = page_url) -> None:
            identifier = re.sub(r"[^a-z0-9]+", "-", f"{slug or 'company'}-{kind}-{len(evidence)}").strip("-")
            evidence.append({
                "id": identifier,
                "company": company,
                "slug": slug,
                "title": " ".join(title.split())[:200],
                "snippet": " ".join(snippet.split())[:600],
                "url": url,
                "source": COMPANY_SOURCE,
            })

        about = str(profile.get("about") or profile.get("summary") or "")
        for index, chunk in enumerate(_chunk(about)):
            title = f"About {company}"
            if index:
                title += f" (part {index + 1})"
            add("about", title, chunk)

        for point in profile.get("keyPoints") or []:
            if isinstance(point, dict):
                text = str(point.get("text") or "")
                urls = [str(url) for url in (point.get("urls") or [])]
            else:
                text, urls = str(point), []
            for chunk in _chunk(text):
                title = chunk[:140].rstrip() + ("…" if len(chunk) > 140 else "")
                add("keypoint", title, chunk, urls[0] if urls else page_url)

        for item_text in profile.get("pros") or []:
            for chunk in _chunk(str(item_text)):
                add("pros", f"Strength — {company}", chunk)

        for item_text in profile.get("cons") or []:
            for chunk in _chunk(str(item_text)):
                add("cons", f"Risk — {company}", chunk)

        sentences: list[str] = []
        for ratio in profile.get("topRatios") or []:
            name = str(ratio.get("name") or "").strip()
            if not name:
                continue
            value = str(ratio.get("text") or "").strip()
            sentences.append(f"{name}: {value}" if value else name)
        for chunk in _chunk(" | ".join(sentences)):
            add("ratios", f"Key ratios — {company}", chunk)

    return evidence


_STOPWORDS = frozenset({
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have",
    "in", "is", "it", "its", "of", "on", "or", "that", "the", "their", "this",
    "to", "was", "were", "with", "over", "under", "about", "than", "but", "not",
})


def _tokens(text: str) -> list[str]:
    return [
        token for token in re.findall(r"[a-z0-9]+", (text or "").lower())
        if len(token) > 1 and token not in _STOPWORDS
    ]


def search_evidence(evidence: Iterable[dict[str, Any]], query: str, limit: int = 8) -> list[dict[str, Any]]:
    """Rank evidence with BM25-style IDF weighting plus token overlap.

    Scoring is deterministic: ties are broken by id. Scores are normalized
    to the 0..1 range relative to the best hit.
    """
    documents = [item for item in (evidence or []) if isinstance(item, dict)]
    query_tokens = list(dict.fromkeys(_tokens(query)))
    if not documents or not query_tokens:
        return []

    total = len(documents)
    document_frequency: dict[str, int] = {}
    tokenized: list[list[str]] = []
    for document in documents:
        tokens = _tokens(f"{document.get('title', '')} {document.get('snippet', '')} {document.get('company', '')}")
        tokenized.append(tokens)
        for token in set(tokens):
            document_frequency[token] = document_frequency.get(token, 0) + 1

    scored: list[tuple[float, float, dict[str, Any]]] = []
    for document, tokens in zip(documents, tokenized):
        term_frequency: dict[str, int] = {}
        for token in tokens:
            term_frequency[token] = term_frequency.get(token, 0) + 1
        raw = 0.0
        matched = 0
        for token in query_tokens:
            count = term_frequency.get(token, 0)
            if not count:
                continue
            matched += 1
            frequency = document_frequency.get(token, 0)
            idf = math.log(1.0 + (total - frequency + 0.5) / (frequency + 0.5))
            raw += (1.0 + math.log(count)) * idf
        if not matched:
            continue
        overlap = matched / len(query_tokens)
        scored.append((raw * (0.5 + 0.5 * overlap), overlap, document))

    if not scored:
        return []
    best = max(score for score, _, _ in scored)
    scored.sort(key=lambda entry: (-entry[0], -entry[1], str(entry[2].get("id", ""))))

    hits: list[dict[str, Any]] = []
    for raw, _overlap, document in scored[: max(0, limit)]:
        hit = dict(document)
        hit["score"] = round(raw / best, 4) if best > 0 else 0.0
        hits.append(hit)
    return hits
