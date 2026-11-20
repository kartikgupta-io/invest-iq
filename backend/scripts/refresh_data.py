"""Populate the live-data cache from Yahoo Finance and Screener.in.

Run from the backend directory:

    python -m scripts.refresh_data
"""

from __future__ import annotations

import asyncio

from app.data import live_sources as live


async def main() -> int:
    print("Refreshing live data from Yahoo Finance and Screener.in …")
    try:
        cache = await live.refresh()
    except Exception as exc:  # noqa: BLE001 - command should report a clean failure
        print(f"Live data refresh failed: {exc}")
        return 1

    quotes = cache.get("quotes") or {}
    profiles = cache.get("profiles") or {}
    print(f"Saved {len(quotes)} quotes and {len(profiles)} profiles at {cache.get('savedAt')}")
    for ticker, quote in quotes.items():
        price = quote.get("price")
        shown = f"{price:,.2f}" if isinstance(price, (int, float)) else "n/a"
        print(f"  {ticker:<12} {shown:>12} {quote.get('currency') or ''}")
    print(f"Cache written to {live.CACHE_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
