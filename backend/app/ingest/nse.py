"""NSE (National Stock Exchange) ingest adapter."""

from __future__ import annotations

import httpx

from app.data.contract import Company
from app.ingest.base import CompanyAdapter

_TIMEOUT = 8.0


class NseAdapter(CompanyAdapter):
    """Thin NSE client that never raises."""

    def __init__(self, timeout: float = _TIMEOUT) -> None:
        self._timeout = timeout

    async def fetch_company(self, symbol: str) -> Company | None:
        url = f"https://www.nseindia.com/api/quote-equity?symbol={symbol.upper()}"
        try:
            async with httpx.AsyncClient(timeout=self._timeout, follow_redirects=True) as client:
                response = await client.get(url, headers={"User-Agent": "InvestIQ/0.1"})
                response.raise_for_status()
                payload = response.json()
                return Company.model_validate(payload)
        except Exception:
            return None