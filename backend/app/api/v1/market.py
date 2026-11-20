"""Market data endpoints."""

from fastapi import APIRouter, Depends

from app.api.deps import get_store
from app.data.contract import DataStore, MarketIndex

router = APIRouter()


@router.get("/indices", response_model=list[MarketIndex])
async def market_indices(store: DataStore = Depends(get_store)) -> list[MarketIndex]:
    return await store.get_market_indices()