"""Financial metric computation and investment scoring.

All values are derived strictly from the company data model; no external
claims are introduced anywhere in this module.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from app.data.contract import AnnualFinancials, Company

_INF = float("inf")


@dataclass
class Metrics:
    slug: str
    ticker: str
    name: str
    sector: str = ""
    revenue: float = 0.0
    revenue_growth: float = 0.0
    revenue_cagr_5y: float = 0.0
    gross_margin: float = 0.0
    operating_margin: float = 0.0
    net_margin: float = 0.0
    roe: float = 0.0
    roce: float = 0.0
    roa: float = 0.0
    eps: float = 0.0
    eps_growth: float = 0.0
    debt_to_equity: float = 0.0
    current_ratio: float = 0.0
    interest_cover: float = 0.0
    operating_cash_flow: float = 0.0
    free_cash_flow: float = 0.0
    fcf_margin: float = 0.0
    dividend_yield: float = 0.0
    pe: float = 0.0
    pb: float = 0.0
    ev_ebitda: float = 0.0
    market_cap: float = 0.0
    price: float = 0.0
    change_pct: float = 0.0
    high52: float = 0.0
    low52: float = 0.0
    growth_pos_since: int = 0
    trend: list[AnnualFinancials] = field(default_factory=list)

    @property
    def years(self) -> int:
        return len(self.trend)


def parse_year(year: str) -> int:
    digits = "".join(ch for ch in year if ch.isdigit())
    return int(digits) if digits else 0


def _growth(cur: float, prev: float) -> float:
    if prev == 0:
        return 0.0
    return (cur - prev) / abs(prev)


def _cagr(values: list[float], limit: int) -> float:
    series = values[-limit:]
    if len(series) < 2 or series[0] <= 0:
        return 0.0
    first, last = series[0], series[-1]
    return (abs(last) / abs(first)) ** (1 / (len(series) - 1)) - 1


def _clamp01(value: float) -> float:
    return min(max(value, 0.0), 1.0)


def _sigmoid(value: float, scale: float) -> float:
    if value <= -scale * 6:
        return 0.0
    if value >= scale * 6:
        return 1.0
    return 1 / (1 + math.exp(-value / scale))


def build_metrics(company: Company) -> Metrics:
    years = sorted(company.annual, key=lambda a: parse_year(a.year))
    if not years:
        return Metrics(slug=company.profile.slug, ticker=company.profile.ticker, name=company.profile.name)
    cur = years[-1]
    prev = years[-2] if len(years) > 1 else cur
    fcf = cur.freeCashFlow

    positive_growth = 0
    for idx in range(1, len(years)):
        if years[idx].revenue >= years[idx - 1].revenue:
            positive_growth += 1

    return Metrics(
        slug=company.profile.slug,
        ticker=company.profile.ticker,
        name=company.profile.name,
        sector=company.profile.sector,
        revenue=cur.revenue,
        revenue_growth=round(_growth(cur.revenue, prev.revenue) * 100, 2),
        revenue_cagr_5y=round(_cagr([a.revenue for a in years], 5) * 100, 2),
        gross_margin=cur.grossMargin * 100,
        operating_margin=cur.operatingMargin * 100,
        net_margin=cur.netMargin * 100,
        roe=cur.roe * 100,
        roce=cur.roce * 100,
        roa=cur.returnOnAssets * 100,
        eps=cur.eps,
        eps_growth=round(_cagr([a.eps for a in years], 5) * 100, 2),
        debt_to_equity=cur.debtToEquity,
        current_ratio=cur.currentRatio,
        interest_cover=cur.interestCover,
        operating_cash_flow=cur.operatingCashFlow,
        free_cash_flow=fcf,
        fcf_margin=(fcf / cur.revenue * 100) if cur.revenue else 0.0,
        dividend_yield=cur.dividendYield * 100,
        pe=cur.peRatio,
        pb=cur.priceToBook,
        ev_ebitda=cur.evToEbitda,
        market_cap=company.quote.marketCap,
        price=company.quote.price,
        change_pct=company.quote.changePct,
        high52=company.quote.high52Week,
        low52=company.quote.low52Week,
        growth_pos_since=positive_growth,
        trend=years,
    )


def sub_scores(m: Metrics) -> dict[str, float]:
    growth = _clamp01(0.5 * _sigmoid(m.revenue_cagr_5y, 12) + 0.5 * _sigmoid(m.eps_growth, 15))
    profitability = _clamp01(0.4 * _sigmoid(m.net_margin, 18) + 0.3 * _sigmoid(m.roe, 20) + 0.3 * _sigmoid(m.roce, 22))
    cashflow = _clamp01(0.6 * _sigmoid(m.fcf_margin, 12) + 0.4 * _sigmoid(m.revenue_cagr_5y, 15))
    leverage = _clamp01(
        _sigmoid(1.6 - m.debt_to_equity, 1.2) * _sigmoid(m.interest_cover, 4) * (0.7 + 0.3 * _sigmoid(m.current_ratio, 1.2))
    )
    valuation = _clamp01(_sigmoid(28 - m.pe, 12)) if m.pe > 0 else 0.5
    consistency = _clamp01(m.growth_pos_since / max(m.years - 1, 1)) if m.years > 1 else 0.5
    return {
        "Growth": round(growth * 100, 1),
        "Profitability": round(profitability * 100, 1),
        "Cash Flow": round(cashflow * 100, 1),
        "Financial Strength": round(leverage * 100, 1),
        "Valuation": round(valuation * 100, 1),
        "Consistency": round(consistency * 100, 1),
    }


def investment_score(m: Metrics) -> float:
    weights = {
        "Growth": 0.2,
        "Profitability": 0.2,
        "Cash Flow": 0.15,
        "Financial Strength": 0.15,
        "Valuation": 0.15,
        "Consistency": 0.15,
    }
    return round(sum(sub_scores(m)[k] * w for k, w in weights.items()), 1)


def rating_for(score: float) -> str:
    if score >= 75:
        return "Strong Buy"
    if score >= 60:
        return "Buy"
    if score >= 45:
        return "Hold"
    if score >= 30:
        return "Reduce"
    return "Sell"