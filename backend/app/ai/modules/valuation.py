"""``valuation`` module — valuation assistant.

Compares current P/E, P/B, EV/EBITDA and dividend yield against sector peers
(``store.get_peer_group``) plus 52-week context. The fallback builds a table and
a deterministic cheap / fair / rich verdict.
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

NAME = "valuation"

SYSTEM = (
    "You are InvestIQ's valuation assistant. Assess whether the company's "
    "current valuation is cheap, fair or rich.\n"
    "Rules:\n"
    "1. Use ONLY the SOURCES block and the peer context provided; never invent "
    "price, multiple or peer figures.\n"
    "2. Cite every number with the source index in brackets, e.g. 'P/E of 27 vs "
    "sector median 22 [1]'.\n"
    "3. Structure the answer: valuation multiples, dividend yield, 52-week "
    "context, then a clear verdict (cheap / fair / rich) with reasoning.\n"
    "4. Remind the reader that multiples must be read relative to peers and "
    "growth. If the SOURCES block is empty, say the view is computed from market "
    "data."
)


def _verdict(pe: float | None, peer_pe: float | None) -> str:
    if pe is None or not peer_pe or peer_pe <= 0:
        return "fair (insufficient peer context)"
    ratio = pe / peer_pe
    if ratio < 0.8:
        return "cheap"
    if ratio > 1.2:
        return "rich"
    return "fair"


def _valuation_fallback(company: Company | None, peers: list[PeerCompany]):
    def fallback(ctx: AIContext, citations: list[Citation]) -> AIReply:
        cits = cite(citations)
        if company is None:
            return AIReply(
                answer="Pick a company for a valuation check, e.g. `valuation of reliance`.\n\n"
                + sources_markdown(cits),
                citations=cits,
                mode="fallback",
            )
        sy = currency_symbol(company)
        quote = company.quote
        vp = max(company.valuation, key=lambda v: v.year) if company.valuation else None
        ann = latest_annual(company)
        pb = (vp.priceToBook if vp else None) or (ann.priceToBook if ann else 0.0)
        ev = (vp.evToEbitda if vp else None) or (ann.evToEbitda if ann else 0.0)
        peer_pes = [p.peRatio for p in peers if p.peRatio]
        peer_pe = median(peer_pes)
        peer_pe_disp = f"{peer_pe:.1f}" if peer_pe else "—"
        lines = [f"### {company.profile.name} ({company.profile.ticker}) — valuation", ""]
        lines.append("| Multiple | Company | Sector median | Read |")
        lines.append("|:--|--:|--:|:--|")
        lines.append(
            f"| P/E | {fmt_float(quote.peRatio)} | {peer_pe_disp} "
            f"| {_verdict(quote.peRatio, peer_pe)} |"
        )
        lines.append(f"| P/B | {fmt_float(pb, 2)} | — (peer P/B not published) | reference |")
        lines.append(f"| EV/EBITDA | {fmt_float(ev)} | — (peer EV/EBITDA not published) | reference |")
        lines.append(
            f"| Dividend yield | {compact_pct(quote.dividendYield)} | — | income proxy |"
        )
        lines += [
            "",
            f"**52-week context:** low {fmt_num(quote.low52Week)} ({sy}) → high "
            f"{fmt_num(quote.high52Week)} ({sy}); last price {fmt_num(quote.price)} ({sy}), "
            f"market cap {fmt_num(quote.marketCap)}.",
            "",
            f"**Verdict (rule-based):** the company trades at **{_verdict(quote.peRatio, peer_pe)}** "
            f"relative to a sector-median P/E of {peer_pe_disp} across {len(peers)} peers.",
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
    fallback = _valuation_fallback(company, peers)
    return await grounded(ctx, req.question, SYSTEM, company=slug, limit=6, fallback=fallback)