"""Keyless real data sources outside Yahoo Finance.

Sources (all public, no API key):
  * Google News RSS  — news headlines with publisher and article links
  * NSE India        — official corporate announcements and filing PDFs
  * Wikipedia REST   — company background plus a real image thumbnail

Every function is best-effort and returns only data actually received. Missing
fields stay ``None``; no headline, filing or image URL is ever invented.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import quote

import httpx

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
GOOGLE_NEWS_URL = "https://news.google.com/rss/search"
NSE_HOME = "https://www.nseindia.com/"
NSE_ANNOUNCEMENTS_URL = "https://www.nseindia.com/api/corporate-announcements"
WIKIPEDIA_SUMMARY_URL = "https://en.wikipedia.org/api/rest_v1/page/summary/{title}"
WIKIPEDIA_SEARCH_URL = "https://en.wikipedia.org/w/api.php"
HTTP_TIMEOUT = 12.0

GOOGLE_NEWS = "Google News"
NSE_SOURCE = "NSE Announcements"
WIKIPEDIA_SOURCE = "Wikipedia"


def _query_tokens(query: str) -> set[str]:
    return {token for token in re.findall(r"[a-z0-9]+", (query or "").lower()) if len(token) > 2}


def _relevant(text: str, tokens: set[str]) -> bool:
    if not tokens:
        return True
    lowered = text.lower()
    return any(token in lowered for token in tokens)


def _iso_pub_date(raw: str | None) -> str | None:
    if not raw:
        return None
    try:
        parsed = parsedate_to_datetime(raw)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat()
    except (TypeError, ValueError):
        return None


def parse_google_news(xml: str, query: str = "", limit: int = 6) -> list[dict[str, Any]]:
    """Parse Google News RSS into real, clickable citations."""
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return []
    tokens = _query_tokens(query)
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for node in root.findall("./channel/item"):
        title = (node.findtext("title") or "").strip()
        url = (node.findtext("link") or "").strip()
        if not title or not url or url in seen:
            continue
        publisher_node = node.find("source")
        publisher = (publisher_node.text or "").strip() if publisher_node is not None else None
        if not _relevant(f"{title} {publisher or ''}", tokens):
            continue
        seen.add(url)
        published = _iso_pub_date(node.findtext("pubDate"))
        slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:60]
        items.append({
            "id": f"gnews-{slug}",
            "title": title[:200],
            "publisher": publisher,
            "url": url,
            "publishedAt": published,
            "source": GOOGLE_NEWS,
        })
        if len(items) >= limit:
            break
    return items


async def fetch_google_news(query: str, limit: int = 6) -> list[dict[str, Any]]:
    """Best-effort news lookup from Google News RSS."""
    term = str(query).strip()
    if not term:
        return []
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, headers={"User-Agent": USER_AGENT}) as client:
            response = await client.get(
                GOOGLE_NEWS_URL,
                params={"q": term, "hl": "en-IN", "gl": "IN", "ceid": "IN:en"},
            )
            response.raise_for_status()
            return parse_google_news(response.text, term, limit)
    except Exception:  # noqa: BLE001 - optional enrichment
        return []


def parse_nse_announcements(rows: Any, symbol: str, limit: int = 6) -> list[dict[str, Any]]:
    """Parse official NSE announcements into real, clickable records."""
    if not isinstance(rows, list):
        return []
    wanted = str(symbol).strip().upper().removesuffix(".NS").removesuffix(".BO")
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        if not isinstance(row, dict):
            continue
        row_symbol = str(row.get("symbol") or "").strip().upper()
        if wanted and row_symbol and row_symbol != wanted:
            continue
        description = re.sub(r"\s+", " ", str(row.get("desc") or "Corporate announcement")).strip()
        attachment = str(row.get("attchmntFile") or "").strip()
        date = str(row.get("an_dt") or "").strip()
        url = attachment or f"https://www.nseindia.com/companies-listing/corporate-filings-announcements?symbol={quote(wanted)}"
        if url in seen:
            continue
        seen.add(url)
        published = None
        if date:
            try:
                naive = datetime.strptime(date, "%d-%b-%Y %H:%M:%S")
                published = naive.replace(tzinfo=timezone.utc).isoformat()
            except ValueError:
                published = None
        items.append({
            "id": f"nse-{re.sub(r'[^a-z0-9]+', '-', f'{wanted}-{date}'.lower()).strip('-')}",
            "title": description[:200],
            "publisher": str(row.get("sm_name") or wanted),
            "url": url,
            "publishedAt": published,
            "source": NSE_SOURCE,
        })
        if len(items) >= limit:
            break
    return items


async def fetch_nse_announcements(symbol: str, limit: int = 6) -> list[dict[str, Any]]:
    """Best-effort official corporate announcement lookup from NSE India.

    NSE gates its API behind a cookie set by the site homepage, so a short
    warm-up request is made first. Failures return an empty list — never a
    guessed filing.
    """
    wanted = str(symbol).strip().upper().removesuffix(".NS").removesuffix(".BO")
    if not wanted:
        return []
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json,text/plain,*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": NSE_HOME,
    }
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, headers=headers, follow_redirects=True) as client:
            await client.get(NSE_HOME)
            response = await client.get(
                NSE_ANNOUNCEMENTS_URL,
                params={"index": "equities", "symbol": wanted},
            )
            response.raise_for_status()
            return parse_nse_announcements(response.json(), wanted, limit)
    except Exception:  # noqa: BLE001 - optional enrichment
        return []


def parse_wikipedia_summary(payload: dict[str, Any]) -> dict[str, Any] | None:
    """Extract a real background blurb, source URL and image from Wikipedia."""
    if not isinstance(payload, dict):
        return None
    extract = str(payload.get("extract") or "").strip()
    if not extract:
        return None
    content = payload.get("content_urls") if isinstance(payload.get("content_urls"), dict) else {}
    desktop = content.get("desktop") if isinstance(content.get("desktop"), dict) else {}
    thumbnail = payload.get("thumbnail") if isinstance(payload.get("thumbnail"), dict) else {}
    original = payload.get("originalimage") if isinstance(payload.get("originalimage"), dict) else {}
    image = thumbnail.get("source") or original.get("source")
    return {
        "title": str(payload.get("title") or ""),
        "description": str(payload.get("description") or ""),
        "extract": extract,
        "url": str(desktop.get("page") or payload.get("content_urls", {}).get("desktop", {}).get("page") or ""),
        "imageUrl": str(image) if image else None,
        "source": WIKIPEDIA_SOURCE,
    }


async def fetch_wikipedia_summary(query: str) -> dict[str, Any] | None:
    """Best-effort company background from Wikipedia (exact title, then search)."""
    term = str(query).strip()
    if not term:
        return None
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, headers=headers) as client:
            response = await client.get(WIKIPEDIA_SUMMARY_URL.format(title=quote(term.replace(" ", "_"))))
            if response.status_code == 200:
                parsed = parse_wikipedia_summary(response.json())
                if parsed:
                    return parsed
            search = await client.get(
                WIKIPEDIA_SEARCH_URL,
                params={"action": "query", "list": "search", "srsearch": term, "format": "json", "srlimit": 3},
            )
            search.raise_for_status()
            hits = (search.json().get("query") or {}).get("search") or []
            for hit in hits:
                title = str(hit.get("title") or "").strip()
                if not title:
                    continue
                detail = await client.get(WIKIPEDIA_SUMMARY_URL.format(title=quote(title.replace(" ", "_"))))
                if detail.status_code == 200:
                    parsed = parse_wikipedia_summary(detail.json())
                    if parsed:
                        return parsed
    except Exception:  # noqa: BLE001 - optional enrichment
        return None
    return None
