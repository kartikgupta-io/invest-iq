"""Market data endpoints."""

from fastapi import APIRouter

from app.data import live_sources as live
from app.data.contract import MarketIndex

router = APIRouter()


@router.get("/indices", response_model=list[MarketIndex])
async def market_indices() -> list[MarketIndex]:
    """Headline index levels, refreshed on demand when older than the index TTL.

    Every payload carries the exchange's market time, the time InvestIQ fetched
    it, the upstream source and an explicit ``stale`` flag — so a cached level
    is never silently presented as a live quote.
    """
    cache = await live.ensure_fresh_indices()
    return [MarketIndex(**item) for item in live.index_payloads(cache)]
