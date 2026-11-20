"""Watchlist endpoints."""

from fastapi import APIRouter, Depends

from app.api.deps import get_store
from app.data.contract import DataStore, Watchlist

router = APIRouter()


@router.get("", response_model=list[Watchlist])
async def watchlists(store: DataStore = Depends(get_store)) -> list[Watchlist]:
    return await store.get_watchlists()