"""Investment scoring engine.

Aggregates six transparent sub-scores into a 0–100 investment score with a
plain-language rating. Pure function of the company data — fully explainable
(see the returned sub_scores and key_metrics).
"""

from __future__ import annotations

from app.ai.citations import company_context
from app.ai.metrics import build_metrics, investment_score, rating_for, sub_scores
from app.ai.schemas import ScoreResponse
from app.data.contract import DataStore


async def score(store: DataStore, slug: str) -> ScoreResponse:
    company = await store.get_company(slug)
    if company is None:
        return ScoreResponse(slug=slug, name="", ticker="", score=0.0, rating="Unknown company.", sub_scores={}, key_metrics={}, summary="", citations=[])
    m = build_metrics(company)
    citations = await company_context(store, slug, limit=2)
    total = investment_score(m)
    rating = rating_for(total)
    subs = sub_scores(m)
    summary = (
        f"{m.name} scores {total}/100 ({rating}). Growth is {subs['Growth']:.0f}/100, profitability "
        f"{subs['Profitability']:.0f}/100 and financial strength {subs['Financial Strength']:.0f}/100. "
        f"Strongest dimension: {max(subs, key=subs.get)}; weakest: {min(subs, key=subs.get)}."
    )
    return ScoreResponse(
        slug=slug,
        name=company.profile.name,
        ticker=company.profile.ticker,
        score=total,
        rating=rating,
        sub_scores=subs,
        key_metrics={
            "revenueGrowth": m.revenue_growth,
            "revenueCAGR5y": m.revenue_cagr_5y,
            "netMargin": m.net_margin,
            "roe": m.roe,
            "debtToEquity": m.debt_to_equity,
            "fcfMargin": m.fcf_margin,
            "pe": m.pe,
        },
        summary=summary,
        citations=citations,
    )