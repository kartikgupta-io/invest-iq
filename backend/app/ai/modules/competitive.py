"""``competitive`` module — competitive & moat analysis.

Compares margins, EBITDA, growth and quality against sector peers
(``store.get_peer_group``), adds qualitative points from the management
discussion / risk factors, and when the LLM is available writes a nuanced moat
narrative. Fallback is a deterministic peer-ratio table plus the qualitative
snippets.
"""

from __future__ import annotations

from app.ai.base import AIContext, AIRequest, AIReply
from app.ai.citations import cite
from app.ai.modules._common import (
    compact_pct,
    currency_symbol,
    ensure_llm,
    fmt_float,
    fmt_num,
    latest_annual,
    median,
    sources_markdown,
)
from app.ai.rag import grounded
from app.data.contract import Citation, Company, PeerCompany

NAME = "competitive"

SYSTEM = (
    "You are InvestIQ's competitive-strategy analyst. Assess the company's "
    "competitive position and the durability of its moat.\n"
    "Rules:\n"
    "1. Use ONLY the SOURCES block and the peer context; never invent competitor "
    "figures or strategy claims.\n"
    "2. Cite every number with the source index, e.g. 'net margin 7% vs sector "
    "14% [1]'.\n"
    "3. Structure: market position, margin & profitability vs peers, growth "
    "advantage, moat quality (cost / brand / network / switching costs), and "
    "the biggest competitive threat.\n"
    "4. If the SOURCES block is empty, say the view is computed from structured "
    "data and management discussion."
)


def _peer_table(company: Company, peers: list[PeerCompany]) -> list[str]:
    if not peers:
        return ["_No sector peers found in the dataset._"]
    lines = [
        "| Peer | P/E | ROE | Net margin | Growth |",
        "|:--|--:|--:|--:|--:|",
    ]
    for p in peers:
        lines.append(
            f"| {p.name} ({p.ticker}) | {fmt_float(p.peRatio)} | {compact_pct(p.roe)} "
            f"| {compact_pct(p.margin)} | {compact_pct(p.revenueGrowth)} |"
        )
    return lines


def _moat_view(company: Company, peers: list[PeerCompany]) -> str:
    ann = latest_annual(company)
    if ann is None:
        return "Insufficient data to profile the moat."
    peer_margins = [p.margin for p in peers if p.margin is not None]
    peer_median = median(peer_margins)
    margin_gap = (ann.netMargin or 0) - (peer_median or 0)
    lines = [
        f"**Margin vs sector:** net margin {compact_pct(ann.netMargin)} "
        f"{margin_gap:+.1f}pp vs peer median {compact_pct(peer_median) if peer_median is not None else '—'}.",
        f"**EBITDA scale:** {fmt_num(ann.ebitda)} ({currency_symbol(company)}) — "
        f"peer EBITDA figures are not published in the peer feed.",
        f"**Growth:** revenue growth {compact_pct(ann.revenueGrowth)} with ROE {compact_pct(ann.roe)}.",
    ]
    if company.riskFactors:
        strongest = max(company.riskFactors, key=lambda r: {"low": 1, "medium": 2, "high": 3}[r.severity])
        lines.append(f"**Principal threat flagged:** {strongest.title} ({strongest.severity}).")
    return "\n".join(lines)


def _competitive_fallback(company: Company | None, peers: list[PeerCompany]):
    def fallback(ctx: AIContext, citations: list[Citation]) -> AIReply:
        cits = cite(citations)
        if company is None:
            return AIReply(
                answer="Pick a company to analyse competitive position, e.g. `competitive "
                "analysis of reliance`.\n\n" + sources_markdown(cits),
                citations=cits,
                mode="fallback",
            )
        md = (company.managementDiscussion or "").strip()
        lines = [
            f"### {company.profile.name} ({company.profile.ticker}) — competitive position",
            "",
            _moat_view(company, peers),
            "",
            "## Peer comparison (rule-based)",
            "",
            *_peer_table(company, peers),
            "",
            "## Management discussion (qualitative)",
            "",
            f"{md[:600] if md else '_No management discussion in the dataset._'}",
            "",
            sources_markdown(cits),
        ]
        return AIReply(answer="\n".join(lines), citations=cits, mode="fallback")

    return fallback


async def run(ctx: AIContext, req: AIRequest) -> AIReply:
    ensure_llm(ctx)
    slug = req.company or (req.companies[0] if req.companies else "") or None
    company = await ctx.store.get_company(slug) if slug else None
    peers = await ctx.store.get_peer_group(slug, 6) if slug else []
    fallback = _competitive_fallback(company, peers)
    return await grounded(ctx, req.question, SYSTEM, company=slug, limit=6, fallback=fallback)