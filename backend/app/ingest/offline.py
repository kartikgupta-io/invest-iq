"""Offline ingest adapter backed by the fixtures data store."""

from __future__ import annotations

from app.data.contract import Company, CompanySummary
from app.data.offline import OfflineDataStore
from app.ingest.base import CompanyAdapter


class OfflineAdapter(CompanyAdapter):
    """Serves companies straight from the generated fixtures."""

    def __init__(self, store: OfflineDataStore | None = None) -> None:
        self._store = store or OfflineDataStore()

    async def fetch_company(self, symbol: str) -> Company | None:
        slug = symbol.lower()
        return await self._store.get_company(slug)

    async def fetch_summary(self, symbol: str) -> CompanySummary | None:
        slug = symbol.lower()
        summaries = await self._store.list_companies()
        for summary in summaries:
            if summary.slug == slug or summary.ticker.lower() == slug:
                return summary
        return None