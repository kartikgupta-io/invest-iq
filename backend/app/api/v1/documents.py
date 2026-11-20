"""Document chunk endpoints."""

from fastapi import APIRouter, Depends

from app.api.deps import get_store
from app.data.contract import DataStore, DocumentChunk

router = APIRouter()


@router.get("/{document_id}/chunks", response_model=list[DocumentChunk])
async def document_chunks(
    document_id: str,
    store: DataStore = Depends(get_store),
) -> list[DocumentChunk]:
    return await store.get_document_chunks(document_id)