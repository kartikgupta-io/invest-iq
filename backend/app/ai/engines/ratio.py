"""Financial ratio explainer.

Resolves a metric key to a plain-language reading of the company's value
relative to its peers, with a citation to the underlying filing.
"""

from __future__ import annotations

from app.ai.citations import company_context
from app.ai.metrics import build_metrics
from app.ai.schemas import RatioExplanation
from app.data.contract import DataStore

_RATIOS: dict[str, tuple[str, str, str]] = {
    "revenueGrowth": ("Revenue growth (YoY %)", "how fast the company grew", "Revenue growth {value:+.1f}% vs peer {p:+.1f}%; growth is re-rating fuel only if margins hold."),
    "netMargin": ("Net margin (%)", "net profit retained from revenue", "Net margin {value:.1f}% vs peer {p:.1f}%: higher means stronger cost control."),
    "operatingMargin": ("Operating margin (%)", "profit before non-operating items", "Operating margin {value:.1f}% vs peer {p:.1f}% shows core business efficiency."),
    "grossMargin": ("Gross margin (%)", "revenue left after direct COGS", "Gross margin {value:.1f}% vs peer {p:.1f}%: a lower value indicates a heavier input-cost mix."),
    "roe": ("Return on equity (%)", "income vs shareholders' equity", "ROE {value:.1f}% vs peer {p:.1f}% mixes operating performance with leverage; use ROCE across capital structures."),
    "roce": ("Return on capital employed (%)", "operating return vs capital invested", "ROCE {value:.1f}% vs peer {p:.1f}% isolates operating efficiency regardless of financing."),
    "roa": ("Return on assets (%)", "net return vs total assets", "ROA {value:.1f}% vs peer {p:.1f}% shows how productively the asset base earns."),
    "debtToEquity": ("Net debt/equity (x)", "leverage vs equity", "Debt/equity {value:.2f}x vs peer {p:.2f}x; elevated leverage raises solvency risk."),
    "currentRatio": ("Current ratio (x)", "current assets vs current liabilities", "Current ratio {value:.2f} vs peer {p:.2f}; below 1.0x signals liquidity strain."),
    "interestCover": ("Interest cover (x)", "EBIT vs interest expense", "Interest cover {value:.1f}x vs peer {p:.1f}x; below 2x constrains refinancing headroom."),
    "eps": ("EPS", "net income per share", "EPS {value:.2f} vs peer {p:.2f} is the base for P/E and dividend capacity."),
    "pe": ("Price/earnings (x)", "price per trailing earnings", "P/E {value:.1f} vs peer {p:.1f}: a low multiple alone is not cheap; check growth."),
    "pb": ("Price/book (x)", "price vs book value per share", "P/B {value:.1f} vs peer {p:.1f}; high multiples reflect brand or asset-side strength."),
    "evToEbitda": ("EV/EBITDA (x)", "enterprise value vs cash earnings", "EV/EBITDA {value:.1f} vs peer {p:.1f} is the standard capital-structure-neutral multiple."),
    "dividendYield": ("Dividend yield (%)", "cash dividend vs price", "Yield {value:.2f}% vs peer {p:.2f}% confirms dividend commitment and payout headroom."),
    "fcfMargin": ("FCF margin (%)", "free cash flow vs revenue", "FCF margin {value:.1f}% vs peer {p:.1f}%; negative FCF constrains the dividend."),
}


async def explain_ratio(store: DataStore, slug: str, metric: str | None) -> RatioExplanation:
    company = await store.get_company(slug)
    if company is None:
        raise ValueError("unknown-company")
    m = build_metrics(company)
    peers = await store.get_peer_group(slug, limit=6)
    citations = await company_context(store, slug, limit=2)

    lookup = metric if metric and metric in _RATIOS else None
    if lookup is None and metric:
        for key in _RATIOS:
            if metric.lower() in key.lower():
                lookup = key
                break
    if lookup is None:
        lookup = "netMargin"

    label, how_to_read, template = _RATIOS[lookup]

    def peer_value(key, value) -> float:
        if not peers:
            return value
        if key == "revenueGrowth":
            return sum(p.revenueGrowth for p in peers) / len(peers)
        if key == "roe":
            return sum(p.roe for p in peers) / len(peers)
        if key == "netMargin":
            return sum(p.margin for p in peers) / len(peers)
        if key == "pe":
            return sum(p.peRatio for p in peers) / len(peers)
        return value

    value_map = {
        "revenueGrowth": m.revenue_growth,
        "netMargin": m.net_margin,
        "operatingMargin": m.operating_margin,
        "grossMargin": m.gross_margin,
        "roe": m.roe,
        "roce": m.roce,
        "roa": m.roa,
        "debtToEquity": m.debt_to_equity,
        "currentRatio": m.current_ratio,
        "interestCover": m.interest_cover,
        "pe": m.pe,
        "pb": m.pb,
        "evToEbitda": m.ev_ebitda,
        "dividendYield": m.dividend_yield,
        "fcfMargin": m.fcf_margin,
    }
    value = value_map.get(lookup, 0.0)
    peer = peer_value(lookup, value)
    interpretation = template.format(year=m.trend[-1].year, value=value, p=peer)
    return RatioExplanation(
        metric=lookup,
        label=label,
        value=value,
        peerMedian=peer,
        howToRead=how_to_read,
        interpretation=interpretation,
        citations=citations[:2],
    )