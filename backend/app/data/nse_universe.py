"""The full NSE domestic-equity universe, indexed locally for instant lookup.

The list comes from NSE India's public ``EQUITY_L.csv`` master file. It is
bundled as a JSON snapshot (``fixtures/nse_universe.json``) so search never
depends on a third-party symbol API, and it can be refreshed best-effort from
the official CSV via :func:`refresh`.

Nothing here is a price or a fundamental. Entries are reference data only —
every financial figure is still fetched live from source when a company is
opened.
"""

from __future__ import annotations

import csv
import io
import json
import os
import re
from pathlib import Path
from typing import Any

import httpx

FIXTURE_PATH = Path(__file__).resolve().parents[1] / "fixtures" / "nse_universe.json"
NSE_EQUITY_CSV = "https://archives.nseindia.com/content/equities/EQUITY_L.csv"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

_cache: dict[str, Any] | None = None
_by_symbol: dict[str, dict[str, Any]] = {}
_by_slug: dict[str, dict[str, Any]] = {}


def _writable_path() -> Path:
    """Where a refreshed snapshot can be written on a serverless instance."""
    override = os.getenv("INVESTIQ_CACHE_PATH")
    if override:
        base = Path(override)
        if not (base.drive and os.name == "posix"):
            return base.with_name("nse_universe.json")
    return FIXTURE_PATH


def _paths() -> list[Path]:
    paths = [_writable_path()]
    if FIXTURE_PATH not in paths:
        paths.append(FIXTURE_PATH)
    return paths


def load(*, force: bool = False) -> dict[str, Any]:
    """Load the newest available universe snapshot (memoised in-process)."""
    global _cache, _by_symbol, _by_slug
    if _cache is not None and not force:
        return _cache
    payload: dict[str, Any] | None = None
    for path in _paths():
        try:
            if path.exists():
                candidate = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(candidate, dict) and isinstance(candidate.get("stocks"), list):
                    if payload is None or str(candidate.get("savedAt") or "") > str(payload.get("savedAt") or ""):
                        payload = candidate
        except (OSError, ValueError):
            continue
    if payload is None:
        payload = {"source": "NSE India", "savedAt": None, "count": 0, "stocks": []}
    _cache = payload
    _by_symbol = {}
    _by_slug = {}
    for entry in payload["stocks"]:
        if not isinstance(entry, dict):
            continue
        symbol = str(entry.get("symbol") or "").upper()
        slug = str(entry.get("slug") or "")
        if symbol:
            _by_symbol[symbol] = entry
        if slug:
            _by_slug.setdefault(slug, entry)
    return payload


def stocks() -> list[dict[str, Any]]:
    return [s for s in load().get("stocks", []) if isinstance(s, dict)]


def meta() -> dict[str, Any]:
    payload = load()
    return {
        "count": len(payload.get("stocks") or []),
        "asOf": payload.get("savedAt"),
        "source": payload.get("source"),
    }


def by_symbol(symbol: str) -> dict[str, Any] | None:
    load()
    return _by_symbol.get(str(symbol or "").strip().upper().removesuffix(".NS"))


def by_slug(slug: str) -> dict[str, Any] | None:
    load()
    return _by_slug.get(str(slug or "").strip().lower())


def slug_from_ticker(ticker: str) -> str:
    """Stable, URL-safe slug for a ticker (kept here to avoid import cycles)."""
    base = str(ticker).strip().lower().removesuffix(".ns").removesuffix(".bo")
    return re.sub(r"[^a-z0-9]+", "-", base).strip("-") or "company"


def to_candidate(entry: dict[str, Any]) -> dict[str, Any]:
    """Convert a universe entry into the shared discovery-candidate shape."""
    symbol = str(entry.get("symbol") or "").upper()
    return {
        "ticker": f"{symbol}.NS",
        "slug": str(entry.get("slug") or slug_from_ticker(symbol)),
        "name": str(entry.get("name") or symbol),
        "exchange": "NSE",
        "currency": "INR",
        "series": str(entry.get("series") or ""),
        "isin": str(entry.get("isin") or ""),
        "indian": True,
        "local": True,
        "score": 1.0,
    }


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(text or "").lower()).strip()


def search(query: str, limit: int = 12) -> list[dict[str, Any]]:
    """Rank local NSE entries by symbol/name relevance. No network calls."""
    term = _norm(query)
    if not term:
        return []
    words = term.split()
    ranked: list[tuple[int, dict[str, Any]]] = []
    for entry in stocks():
        symbol = _norm(entry.get("symbol"))
        name = _norm(entry.get("name"))
        slug = _norm(entry.get("slug"))
        if not symbol and not name:
            continue
        score = 0
        if symbol == term or name == term:
            score = 100
        elif symbol.startswith(term):
            score = 90
        elif name.startswith(term):
            score = 80
        elif all(word in symbol.split() for word in words):
            score = 70
        elif all(word in name for word in words):
            score = 60
        elif term in symbol:
            score = 50
        elif term in name or term in slug:
            score = 40
        else:
            continue
        if str(entry.get("series") or "") == "EQ":
            score += 5
        ranked.append((score, entry))
    ranked.sort(key=lambda pair: (-pair[0], str(pair[1].get("symbol") or "")))
    return [to_candidate(entry) for _, entry in ranked[:limit]]


def build_snapshot(csv_text: str, preferred: dict[str, str] | None = None) -> dict[str, Any]:
    """Build a universe snapshot from the official NSE master CSV."""
    from datetime import datetime, timezone

    preferred = preferred or {}
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in csv.DictReader(io.StringIO(csv_text)):
        symbol = str(row.get("SYMBOL") or "").strip().upper()
        name = str(row.get("NAME OF COMPANY") or "").strip()
        if not symbol or not name or symbol in seen:
            continue
        seen.add(symbol)
        rows.append(
            {
                "symbol": symbol,
                "yahooSymbol": f"{symbol}.NS",
                "slug": preferred.get(symbol) or slug_from_ticker(symbol),
                "name": name,
                "series": str(row.get(" SERIES") or "").strip(),
                "faceValue": str(row.get(" FACE VALUE") or "").strip(),
                "isin": str(row.get(" ISIN NUMBER") or "").strip(),
                "listingDate": str(row.get(" DATE OF LISTING") or "").strip(),
            }
        )
    return {
        "source": "NSE India — EQUITY_L.csv",
        "savedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(rows),
        "stocks": rows,
    }


async def refresh() -> dict[str, Any]:
    """Best-effort refresh from the official NSE CSV; keeps the old data on failure."""
    try:
        async with httpx.AsyncClient(timeout=30, headers={"User-Agent": USER_AGENT, "Referer": "https://www.nseindia.com/"}, follow_redirects=True) as client:
            response = await client.get(NSE_EQUITY_CSV)
            response.raise_for_status()
            snapshot = build_snapshot(response.text)
    except Exception as exc:  # noqa: BLE001 - bundled snapshot stays authoritative
        return {"ok": False, "error": str(exc), **meta()}
    try:
        path = _writable_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    except OSError:
        pass  # read-only bundle: the in-memory update below still applies
    load(force=True)
    return {"ok": True, **meta()}
