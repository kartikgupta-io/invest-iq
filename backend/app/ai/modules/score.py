"""``score`` module — INVESTIQ INVESTMENT SCORING ENGINE.

Deterministic, rule-based 0-100 composite score for one company, computed from
the structured financials and peer data. The LLM never decides the numbers; when
available it only adds a clearly-labelled commentary layer on top of the
pre-computed scorecard. Fallbacks produce the same scorecard with zero LLM
dependency.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.ai.base import AIContext, AIRequest, AIReply
from app.ai.citations import cite
from app.ai.modules._common import (
    cagr,
    clamp,
    compact_pct,
    ensure_llm,
    linear,
    median,
    sorted_annual,
    sources_markdown,
)
from app.ai.rag import grounded
from app.data.contract import Citation, Company, PeerCompany

NAME = "score"

WEIGHTS = {
    "Growth": 0.30,
    "Profitability": 0.30,
    "Financial health": 0.20,
    "Valuation": 0.10,
    "Quality": 0.10,
}

RATING_BANDS = [
    (80.0, "Strong Buy"),
    (65.0, "Buy"),
    (50.0, "Hold"),
    (35.0, "Sell"),
    (0.0, "Strong Sell"),
]

DISCLAIMER = "Model-based heuristic score (0-100) computed from filings and peer data — explanatory, not investment advice."

SYSTEM = (
    "You are InvestIQ's quantitative commentator. A deterministic rule-based "
    "scorecard has ALREADY been computed from the company's filings and peer "
    "data — the sub-scores, weights and overall rating are final and must NOT be "
    "changed. Write a concise 'AI commentary' (150-250 words) that:\n"
    "1. Explains the two pillars that drive the score most.\n"
    "2. Summarises why the overall rating was reached.\n"
    "3. Lists the key risks to the thesis.\n"
    "Rules:\n"
    "- Cite every claim with the source index in brackets, e.g. 'net margin "
    "expansion supports Profitability [1]'.\n"
    "- Never invent numbers; only restate figures present in the SOURCES block.\n"
    "- Markdown headings, one-line takeaway at the end."
)


def rating_for(score: float) -> str:
    for floor, label in RATING_BANDS:
        if score >= floor:
            return label
    return "Strong Sell"


@dataclass(frozen=True)
class ScoreResult:
    total: float
    rating: str
    factors: dict[str, float]
    basis: dict[str, str]
    key_metrics: dict[str, float]


def _peer_medians(peers: list[PeerCompany]) -> tuple[float | None, float | None]:
    pes = [p.peRatio for p in peers if p.peRatio]
    margins = [p.margin for p in peers if p.margin is not None]
    roes = [p.roe for p in peers if p.roe is not None]
    return median(pes), median(margins or roes)


def compute_score(company: Company, peers: list[PeerCompany]) -> ScoreResult:
    rows = sorted_annual(company)
    if not rows:
        return ScoreResult(0.0, "Strong Sell", {}, {}, {})
    latest = rows[-1]
    peer_pe, peer_prof = _peer_medians(peers)

    revenues = [a.revenue for a in rows if a.revenue]
    incomes = [a.netIncome for a in rows if a.netIncome]
    rev_cagr = cagr(revenues) if len(revenues) > 1 else latest.revenueGrowth
    inc_cagr = cagr(incomes) if len(incomes) > 1 else None

    growth = (
        0.4 * (linear(rev_cagr, -5, 25) if rev_cagr is not None else 50)
        + 0.3 * (linear(inc_cagr, -10, 30) if inc_cagr is not None else 50)
        + 0.3 * (linear(latest.revenueGrowth, -10, 25) if latest.revenueGrowth is not None else 50)
    )

    margin_rel = (latest.netMargin or 0) - (peer_prof if peer_prof is not None else 0)
    prof = (
        0.5 * linear(latest.netMargin or 0, 0, 25)
        + 0.3 * linear(margin_rel, -10, 10)
        + 0.2 * linear(latest.roe or 0, 0, 30)
    )

    de = latest.debtToEquity or 0.0
    cover = latest.interestCover or 0.0
    cr = latest.currentRatio or 0.0
    health = (
        0.4 * linear(-de, -2.5, 0.0)  # de=0 -> 100, de=2.5 -> 0
        + 0.3 * linear(cover, 0, 5)
        + 0.3 * linear(cr, 0.5, 2.5)
    )

    pe = latest.peRatio or 0.0
    if peer_pe and peer_pe > 0:
        rel = (pe - peer_pe) / peer_pe
        val = linear(-rel, -0.5, 0.6)
    else:
        val = 55.0
    val = clamp(val)

    positive_growth = sum(1 for a in rows if (a.revenueGrowth or 0) >= 0) / max(len(rows), 1)
    fcf_conv = (latest.freeCashFlow / latest.netIncome) if latest.netIncome else 0.0
    quality = positive_growth * 40 + linear(fcf_conv, 0, 1.5) * 60

    factors = {
        "Growth": clamp(growth),
        "Profitability": clamp(prof),
        "Financial health": clamp(health),
        "Valuation": val,
        "Quality": clamp(quality),
    }
    total = sum(factors[name] * WEIGHTS[name] for name in WEIGHTS)
    basis = {
        "Growth": (f"revenue CAGR {compact_pct(rev_cagr) if rev_cagr is not None else 'n/a'} "
                   f"; net-income CAGR {compact_pct(inc_cagr) if inc_cagr is not None else 'n/a'} "
                   f"; latest growth {compact_pct(latest.revenueGrowth)}"),
        "Profitability": (f"net margin {compact_pct(latest.netMargin)}, vs peer median "
                          f"{compact_pct(peer_prof) if peer_prof is not None else 'n/a'}, "
                          f"ROE {compact_pct(latest.roe)}"),
        "Financial health": f"debt/equity {de:.2f}, interest cover {cover:.1f}x, current ratio {cr:.2f}",
        "Valuation": (f"P/E {pe:.1f} vs sector median {peer_pe:.1f}" if peer_pe else f"P/E {pe:.1f} (no peer set)"),
        "Quality": f"{positive_growth * 100:.0f}% periods grew; FCF conversion {fcf_conv:.2f}x",
    }
    key_metrics = {
        "revenueGrowth": latest.revenueGrowth or 0.0,
        "netMargin": latest.netMargin or 0.0,
        "roe": latest.roe or 0.0,
        "debtToEquity": de,
        "peRatio": pe,
    }
    return ScoreResult(total, rating_for(total), factors, basis, key_metrics)


def scorecard_markdown(company: Company, result: ScoreResult, cits: list[Citation]) -> str:
    lines = [
        f"# Scorecard · {company.profile.name} ({company.profile.ticker}) — **{result.total:.1f}/100 · {result.rating}**",
        "",
        f"> {DISCLAIMER}",
        "",
        "| Pillar (weight) | Score | Basis |",
        "|:--|--:|:--|",
    ]
    for name in WEIGHTS:
        score = result.factors.get(name)
        basis = result.basis.get(name, "— (no sourced annual data)")
        rendered = f"{score:.0f}" if score is not None else "—"
        lines.append(f"| {name} ({WEIGHTS[name]:.0%}) | {rendered} | {basis} |")
    km = result.key_metrics
    key_metrics_line = "**Key metrics:** " + (
        "revenue growth " + compact_pct(km.get("revenueGrowth"))
        + "; net margin " + compact_pct(km.get("netMargin"))
        + "; ROE " + compact_pct(km.get("roe"))
        + "; debt/equity " + (f"{km['debtToEquity']:.2f}" if "debtToEquity" in km else "—")
        + "; P/E " + (f"{km['peRatio']:.1f}" if "peRatio" in km else "—") + "."
        if km
        else "_No sourced annual data to score._"
    )
    lines += [
        "",
        key_metrics_line,
        "",
        f"**Overall rating: {result.rating} ({result.total:.1f}/100).** {DISCLAIMER}",
    ]
    if cits:
        lines += ["", sources_markdown(cits)]
    return "\n".join(lines)


def _score_fallback(company: Company | None, peers: list[PeerCompany]):
    def fallback(ctx: AIContext, citations: list[Citation]) -> AIReply:
        cits = cite(citations)
        if company is None:
            return AIReply(
                answer="To score a company, pass `company` (e.g. reliance) in the request.\n\n"
                + sources_markdown(cits),
                citations=cits,
                mode="fallback",
            )
        result = compute_score(company, peers)
        return AIReply(answer=scorecard_markdown(company, result, cits), citations=cits, mode="fallback")

    return fallback


async def run(ctx: AIContext, req: AIRequest) -> AIReply:
    ensure_llm(ctx)
    slug = req.company or (req.companies[0] if req.companies else "") or None
    company = await ctx.store.get_company(slug) if slug else None
    peers = await ctx.store.get_peer_group(slug, 6) if slug else []
    fallback = _score_fallback(company, peers)
    reply = await grounded(ctx, req.question, SYSTEM, company=slug, limit=6, fallback=fallback)
    if company is not None and reply.mode != "fallback":
        result = compute_score(company, peers)
        card = scorecard_markdown(company, result, cite(reply.citations))
        answer = card + "\n\n## AI commentary\n\n" + reply.answer.strip()
        return AIReply(answer=answer, citations=reply.citations, mode="live", model=reply.model)
    return reply