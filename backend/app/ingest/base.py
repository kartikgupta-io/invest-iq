"""Abstract contract every company ingest adapter must satisfy."""

from __future__ import annotations

from abc import ABC, abstractmethod

from app.data.contract import Company, CompanySummary


class CompanyAdapter(ABC):
    """Loads a company payload from some source. Never raises on network failure."""

    @abstractmethod
    async def fetch_company(self, symbol: str) -> Company | None:
        """Return a validated :class:`Company`, or ``None`` when unavailable."""

    async def fetch_summary(self, symbol: str) -> CompanySummary | None:
        """Return a slim summary derived from the fetched company."""
        company = await self.fetch_company(symbol)
        if company is None or not company.annual:
            return None
        latest = company.annual[-1]
        return CompanySummary(
            slug=company.profile.slug,
            ticker=company.profile.ticker,
            name=company.profile.name,
            sector=company.profile.sector,
            exchange=company.profile.exchange,
            currency=company.profile.currency,
            website=company.profile.website or None,
            marketCap=company.quote.marketCap,
            price=company.quote.price,
            changePct=company.quote.changePct,
            peRatio=company.quote.peRatio,
            roe=latest.roe,
            revenueGrowth=latest.revenueGrowth,
        )