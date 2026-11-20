"""Risk analyser.

Blends the qualitative risk factors stored for a company with mechanical,
data-derived risk signals (margin trajectory, leverage, liquidity, valuation,
cash-flow quality). Every risk item cites the evidence it derives from.
"""

from __future__ import annotations

from app.ai.citations import company_context
from app.ai.metrics import build_metrics
from app.ai.schemas import RiskItem, RiskResponse
from app.data.contract import DataStore


async def analyze_risk(store: DataStore, slug: str) -> RiskResponse:
    company = await store.get_company(slug)
    if company is None:
        return RiskResponse(slug=slug, name="", risks=[], overall="Unknown company.", citations=[])
    m = build_metrics(company)
    citations = await company_context(store, slug, limit=3)
    risks: list[RiskItem] = []

    if m.debt_to_equity > 1.0:
        risks.append(
            RiskItem(
                severity="medium" if m.debt_to_equity < 1.5 else "high",
                title="Elevated leverage",
                description="Net debt/equity is above the 1.0x comfort level used in this analysis.",
                evidence=f"{m.debt_to_equity:.2f}x net debt-to-equity; interest cover {m.interest_cover:.1f}x.",
                citations=citations[:1],
            )
        )
    if m.interest_cover < 2.0:
        risks.append(
            RiskItem(
                severity="high",
                title="Thin interest cover",
                description="Operating earnings cover interest expense by less than 2x, shrinking headroom.",
                evidence=f"Interest cover {m.interest_cover:.1f}x.",
                citations=citations[:1],
            )
        )
    if m.current_ratio < 1.0:
        risks.append(
            RiskItem(
                severity="medium",
                title="Liquidity pressure",
                description="Current ratio below 1.0 implies short-term liabilities exceed current assets.",
                evidence=f"Current ratio {m.current_ratio:.2f}.",
                citations=citations[:1],
            )
        )
    if m.net_margin < 5.0:
        risks.append(
            RiskItem(
                severity="low" if m.net_margin >= 0 else "medium",
                title="Thin or negative margins",
                description="Net margin is unusually low, leaving little room for input-price pressure.",
                evidence=f"Net margin {m.net_margin:.1f}%.",
                citations=citations[:1],
            )
        )
    if m.pe > 40:
        risks.append(
            RiskItem(
                severity="medium",
                title="Premium valuation",
                description="A P/E above 40x prices in high growth expectations.",
                evidence=f"P/E {m.pe:.1f} on latest earnings.",
                citations=citations[:1],
            )
        )
    if m.fcf_margin < 0:
        risks.append(
            RiskItem(
                severity="medium",
                title="Negative free cash flow",
                description="Free cash flow turned negative, which limits dividend coverage.",
                evidence=f"FCF margin {m.fcf_margin:.1f}%.",
                citations=citations[:1],
            )
        )

    for factor in company.riskFactors:
        risks.append(
            RiskItem(
                severity=factor.severity,
                title=factor.title,
                description=factor.description,
                evidence="Qualitative risk factor from the stored report content.",
                citations=citations[:1],
            )
        )

    high = [r for r in risks if r.severity == "high"]
    overall = (
        f"{len(high)} high-severity risk(s) identified."
        if high
        else f"{len(risks)} medium-to-low risk item(s); no high-severity signals pre-screened."
    )
    return RiskResponse(slug=slug, name=company.profile.name, risks=risks, overall=overall, citations=citations)