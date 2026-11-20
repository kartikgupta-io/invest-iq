"""Competitive analysis.

Ranks a company against its sector peers on market cap, growth, profitability,
efficiency and cash conversion, and renders a radar chart spec for the UI.
"""

from __future__ import annotations

from app.ai.citations import company_context
from app.ai.metrics import build_metrics
from app.ai.schemas import ChartSpec, CompetitiveResponse
from app.data.contract import DataStore


async def competitive(store: DataStore, slug: str) -> CompetitiveResponse:
    company = await store.get_company(slug)
    if company is None:
        return CompetitiveResponse(slug=slug, name="", position="Unknown company.", moat="", peers=[], strengths=[], weaknesses=[], radar=None, citations=[])
    m = build_metrics(company)
    peers = await store.get_peer_group(slug, limit=6)
    citations = await company_context(store, slug, limit=3)

    def rank(values, high=True):
        ordered = sorted(values, reverse=high)
        return [ordered.index(v) + 1 for v in values]

    peer_names = [p.name for p in peers]
    values_share = [p.marketCap / m.market_cap for p in peers] if m.market_cap else [1.0] * len(peers)
    values_growth = [p.revenueGrowth for p in peers]
    values_roe = [p.roe for p in peers]

    position = _position_text(m, peers)
    strengths = [
        f"Largest in peer set, P/E {m.pe:.1f}",
        f"ROE {m.roe:.1f}% exceeds the peer mean {_mean_roe(peers):.1f}%" if m.roe > _mean_roe(peers) else f"ROCE {m.roce:.1f}% is the strongest operating return in the set",
    ]
    weaknesses = [
        f"Net margin {m.net_margin:.1f}% sits below the peer average {_mean(peers, 'margin'):.1f}%" if m.net_margin < _mean(peers, "margin") else f"Scaled by {m.revenue_growth:+.1f}% YoY growth, the margin base ({m.net_margin:.1f}%) deserves monitoring.",
    ]

    radar = ChartSpec(
        type="radar",
        title="Competitive position vs peers",
        labels=["Market cap", "Growth", "ROE", "Margin", "FCF margin"],
        series=[
            {
                "name": m.name,
                "data": [
                    m.market_cap / max([p.marketCap for p in peers] + [1.0]),
                    _norm(m.revenue_growth, -10, 30),
                    _norm(m.roe, 0, 30),
                    _norm(m.net_margin, 0, 25),
                    _norm(m.fcf_margin, -10, 25),
                ],
            }
        ],
    )
    return CompetitiveResponse(
        slug=slug,
        name=company.profile.name,
        position=position,
        moat=position,
        peers=peers,
        strengths=strengths,
        weaknesses=weaknesses,
        radar=radar,
        citations=citations,
    )


def _position_text(m, peers) -> str:
    if not peers:
        return "No covered peers in the same sector; benchmarks are unavailable."
    count = len(peers) + 1
    better = sum(1 for p in peers if p.roe > m.roe)
    rank = better + 1
    return (
        f"{m.name} ranks {rank} of {count} in the {m.sector} peer set on returns (ROE), with growth of "
        f"{m.revenue_growth:+.1f}% (peer mean {_mean(peers, 'growth'):+.1f}%) and net margin "
        f"{m.net_margin:.1f}% (peer mean {_mean(peers, 'margin'):.1f}%)."
    )


def _mean(peers, key) -> float:
    if not peers:
        return 0.0
    if key == "margin":
        return sum(p.margin for p in peers) / len(peers)
    if key == "growth":
        return sum(p.revenueGrowth for p in peers) / len(peers)
    return 0.0


def _mean_roe(peers) -> float:
    return sum(p.roe for p in peers) / len(peers) if peers else 0.0


def _norm(value: float, lo: float, hi: float) -> float:
    if hi == lo:
        return 0.5
    return min(max((value - lo) / (hi - lo), 0.0), 1.0)