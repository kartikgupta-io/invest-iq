"""Company endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_store
from app.data.contract import (
    AnnualFinancials,
    Company,
    CompanySummary,
    DataStore,
    FinancialDocument,
    PeerCompany,
)

router = APIRouter()


@router.get("", response_model=list[CompanySummary])
async def list_companies(
    q: str | None = Query(default=None, max_length=200),
    store: DataStore = Depends(get_store),
) -> list[CompanySummary]:
    if q:
        return await store.search_companies(q)
    return await store.list_companies()


@router.get("/{slug}", response_model=Company)
async def get_company(slug: str, store: DataStore = Depends(get_store)) -> Company:
    company = await store.get_company(slug)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


@router.get("/{slug}/financials", response_model=list[AnnualFinancials])
async def company_financials(slug: str, store: DataStore = Depends(get_store)) -> list[AnnualFinancials]:
    company = await store.get_company(slug)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    return company.annual


@router.get("/{slug}/documents", response_model=list[FinancialDocument])
async def company_documents(slug: str, store: DataStore = Depends(get_store)) -> list[FinancialDocument]:
    company = await store.get_company(slug)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    return await store.get_documents(slug)


@router.get("/{slug}/peers", response_model=list[PeerCompany])
async def company_peers(slug: str, store: DataStore = Depends(get_store)) -> list[PeerCompany]:
    company = await store.get_company(slug)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    return await store.get_peer_group(slug)