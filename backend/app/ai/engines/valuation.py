"""Valuation assistant.

Compares trading multiples against the peer set and derives a DCF-lite fair
value range from free cash flow and a conservative terminal growth assumption.
The range and signal are mechanically derived and fully sourced.
"""

from __future__ import annotations

from app.ai.citations import company_context
from app.ai.metrics import build_metrics
from app.ai.schemas import ValuationResponse
from app.data.contract import DataStore

_DISCOUNT = 0.10
_TERMINAL_GROWTH = 0.04


async def valuate(store: DataStore, slug: str) -> ValuationResponse:
    company = await store.get_company(slug)
    if company is None:
        return ValuationResponse(slug=slug, name="", fairValueRange=[0, 0], currentPrice=0, signal="unknown", explanation="Unknown company.", citations=[])
    m = build_metrics(company)
    peers = await store.get_peer_group(slug, limit=6)
    citations = await company_context(store, slug, limit=3)

    peer_pe = [p.peRatio for p in peers if p.peRatio > 0]
    sector_pe = sum(peer_pe) / len(peer_pe) if peer_pe else (m.pe or 15.0)

    per_value = m.eps * sector_pe
    book_value = m.trend[-1].bookValue
    pb_value = book_value * 1.5 if book_value else per_value

    fcf = m.free_cash_flow
    shares = m.trend[-1].sharesOutstanding or 1
    if fcf > 0:
        # Two-stage DCF-lite: 5 yrs at latest growth, then terminal growth.
        g = max(min(m.revenue_cagr_5y / 100, 0.15), 0.0)
        cash = sum(fcf * (1 + g) ** t / (1 + _DISCOUNT) ** t for t in range(1, 6))
        tv = fcf * (1 + _TERMINAL_GROWTH) / (_DISCOUNT - _TERMINAL_GROWTH)
        dcf_value = (cash + tv / (1 + _DISCOUNT) ** 5) / shares
    else:
        dcf_value = per_value

    candidates = [value for value in (per_value, pb_value, dcf_value) if value > 0]
    low = min(candidates) * 0.85
    high = max(candidates) * 1.15

    price = m.price
    if high < price:
        signal = "overvalued"
        explanation = (
            f"Trading at {price:.2f}, above the {low:.2f}–{high:.2f} fair-value band built from a "
            f"sector P/E of {sector_pe:.1f} and a DCF-lite valuation. Current price exceeds every "
            f"methodical anchor."
        )
    elif low > price:
        signal = "undervalued"
        explanation = (
            f"Trading at {price:.2f}, below the {low:.2f}–{high:.2f} fair-value band (sector P/E "
            f"{sector_pe:.1f}). The market is pricing below the methodical anchors."
        )
    else:
        signal = "fairly valued"
        explanation = (
            f"Trading at {price:.2f}, inside the {low:.2f}–{high:.2f} fair-value band. Relative to "
            f"peers (sector P/E {sector_pe:.1f}) the price is in line with the methodical anchors."
        )

    return ValuationResponse(
        slug=slug,
        name=company.profile.name,
        fairValueRange=[round(low, 2), round(high, 2)],
        currentPrice=price,
        signal=signal,
        explanation=explanation,
        citations=citations,
    )