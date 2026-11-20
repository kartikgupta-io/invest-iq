"""Build a notification feed from real, current market data.

Nothing here is invented. Every price item is derived from a Yahoo Finance
quote in the live cache, and every system item from the actual state of the
last harvest. If the upstream data is missing, the corresponding notification
is simply omitted rather than fabricated.
"""

from __future__ import annotations

from typing import Any

from app.data.contract import NotificationItem
from app.data.live_sources import UNIVERSE, is_fresh

# Only meaningful daily moves become notifications. This keeps the feed useful
# instead of filling it with noise from flat sessions.
MOVE_THRESHOLD_PCT = 0.5
MAX_PRICE_ITEMS = 6


def _as_float(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def _slug_for_ticker(ticker: str) -> str | None:
    wanted = str(ticker).strip().upper()
    for slug, (symbol, _search) in UNIVERSE.items():
        if symbol.upper() == wanted:
            return slug
    return None


def _price_items(quotes: dict[str, Any], saved_at: str | None) -> list[NotificationItem]:
    moves: list[tuple[float, NotificationItem]] = []
    for ticker, raw in quotes.items():
        if not isinstance(raw, dict):
            continue
        change = _as_float(raw.get("changePct"))
        price = _as_float(raw.get("price"))
        if change is None or price is None or abs(change) < MOVE_THRESHOLD_PCT:
            continue

        name = str(raw.get("name") or ticker).strip() or str(ticker)
        direction = "up" if change > 0 else "down"
        magnitude = abs(change)
        previous = _as_float(raw.get("previousClose"))
        close_note = (
            f" against a previous close of ₹{previous:,.2f}"
            if previous is not None and previous > 0
            else ""
        )
        day = str(raw.get("asOf") or saved_at or "")[:10] or "latest"
        item = NotificationItem(
            id=f"price-{str(ticker).lower()}-{day}",
            type="price",
            title=f"{ticker} {direction} {magnitude:.1f}%",
            message=f"{name} last traded at ₹{price:,.2f} ({change:+.2f}%){close_note}.",
            time=str(raw.get("asOf") or saved_at or ""),
            read=False,
            slug=_slug_for_ticker(str(ticker)),
            source="Yahoo Finance",
        )
        moves.append((magnitude, item))

    moves.sort(key=lambda pair: pair[0], reverse=True)
    return [item for _, item in moves[:MAX_PRICE_ITEMS]]


def _system_item(cache: dict[str, Any]) -> NotificationItem | None:
    saved_at = cache.get("savedAt")
    if not saved_at:
        return NotificationItem(
            id="system-no-snapshot",
            type="system",
            title="No live snapshot yet",
            message="Run Refresh now to load quotes from Yahoo Finance and fundamentals from Screener.in.",
            time="",
            read=False,
            source="InvestIQ sync",
        )

    when = str(saved_at)
    fresh = is_fresh(when)
    return NotificationItem(
        id=f"system-sync-{when[:10]}",
        type="system",
        title="Live snapshot synced" if fresh else "Data snapshot is stale",
        message=(
            "Yahoo Finance quotes and Screener.in fundamentals are up to date."
            if fresh
            else "The last successful harvest is older than the freshness window. Use Refresh now to pull current data."
        ),
        time=when,
        read=False,
        source="InvestIQ sync",
    )


def build_notifications(cache: dict[str, Any] | None, limit: int = 20) -> list[NotificationItem]:
    """Return a freshness-accurate feed sorted newest first.

    ``cache`` is the same on-disk snapshot the rest of the API serves, so the
    notifications can never disagree with the numbers shown elsewhere.
    """
    data = cache if isinstance(cache, dict) else {}
    quotes = data.get("quotes") if isinstance(data.get("quotes"), dict) else {}
    saved_at = data.get("savedAt")

    items: list[NotificationItem] = _price_items(quotes, saved_at)
    system = _system_item(data)
    if system is not None:
        items.append(system)

    items.sort(key=lambda item: item.time or "", reverse=True)
    return items[:limit]
