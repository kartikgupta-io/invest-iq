"""Semantic search endpoint."""

from fastapi import APIRouter, Depends

from app.api.deps import get_store
from app.data.contract import DataStore, SearchQuery, SearchResult

router = APIRouter()


@router.post("", response_model=SearchResult)
async def search(
    query: SearchQuery,
    store: DataStore = Depends(get_store),
) -> SearchResult:
    return await store.semantic_search(query)