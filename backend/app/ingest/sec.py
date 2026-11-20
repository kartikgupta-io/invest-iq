"""SEC EDGAR ingest adapter.

Attempts to fetch a company payload from the SEC EDGAR JSON API and validate it
against the :class:`Company` contract. Any network or parsing failure — or a
non-200 response — results in ``None`` so the application stays offline-capable.
"""

from __future__ import annotations

import httpx

from app.data.contract import Company
from app.ingest.base import CompanyAdapter

_TIMEOUT = 8.0


class SecAdapter(CompanyAdapter):
    """Thin SEC EDGAR client that never raises."""

    def __init__(self, timeout: float = _TIMEOUT) -> None:
        self._timeout = timeout

    async def fetch_company(self, symbol: str) -> Company | None:
        url = f"https://data.sec.gov/api/xbrl/companyconcept/{symbol}/us-gaap/Revenues.json"
        try:
            async with httpx.AsyncClient(timeout=self._timeout, follow_redirects=True) as client:
                response = await client.get(url, headers={"User-Agent": "InvestIQ research@example.com"})
                response.raise_for_status()
                payload = response.json()
                return Company.model_validate(payload)
        except Exception:
            return None