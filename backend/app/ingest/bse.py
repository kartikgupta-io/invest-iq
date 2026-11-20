"""BSE (Bombay Stock Exchange) ingest adapter."""

from __future__ import annotations

import httpx

from app.data.contract import Company
from app.ingest.base import CompanyAdapter

_TIMEOUT = 8.0


class BseAdapter(CompanyAdapter):
    """Thin BSE client that never raises."""

    def __init__(self, timeout: float = _TIMEOUT) -> None:
        self._timeout = timeout

    async def fetch_company(self, symbol: str) -> Company | None:
        url = f"https://api.bseindia.com/BseIndiaAPI/api/StockPriceToDate/w?symbol={symbol.upper()}&fromdate=01-01-2024&todate=01-01-2026"
        try:
            async with httpx.AsyncClient(timeout=self._timeout, follow_redirects=True) as client:
                response = await client.get(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
                response.raise_for_status()
                payload = response.json()
                return Company.model_validate(payload)
        except Exception:
            return None