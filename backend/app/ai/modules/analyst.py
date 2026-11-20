"""``analyst`` module — general investment Q&A.

Grounded in the company's filings when ``req.company`` is set; otherwise the
retrieval is global. The fallback is a deterministic fundamental snapshot built
from the latest annual row, the top quote stats and any retrieved citations.
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
)
from app.ai.rag import grounded
from app.data.contract import Citation, Company

NAME = "analyst"

SYSTEM = (
    "You are InvestIQ's senior investment research analyst. "
    "Answer the user's question about a company's fundamentals, "
    "performance, risks, valuation or outlook.\n"
    "Rules:\n"
    "1. Base every factual claim ONLY on the SOURCES block plus the context above; "
    "never invent tickers, prices, margins, dates or growth figures.\n"
    "2. Cite every quantitative statement with the source number in brackets, e.g. "
    "'revenue grew 12% last year [1]' or 'net margin expanded to 15% [2]'.\n"
    "3. If the SOURCES block is empty, say the claim cannot be certified from filings "
    "rather than guessing.\n"
    "4. Use concise markdown with ## headings. Give a balanced view: strengths, risks "
    "and a one-line takeaway."
)


def _source_footer(citations: list[Citation]) -> str:
    cits = cite(citations)
    if not cits:
        return "_No documents retrieved — snapshot above is computed from market data._"
    lines = ["### Sources", ""]
    for c in cits[:6]:
        lines.append(f"- {c.title} (p.{c.page} · {c.source}) — {c.snippet.strip()[:200]}")
    return "\n".join(lines)


def _company_fallback(company: Company | None):
    """Deterministic bullet summary when the LLM is unavailable."""

    def fallback(ctx: AIContext, citations: list[Citation]) -> AIReply:
        cits = cite(citations)
        if company is None:
            return AIReply(
                answer=(
                    "No company was set for this question. Add a company (e.g. "
                    "`reliance`) or ask about the general market, and I will ground "
                    "the answer in filings.\n\n" + _source_footer(cits)
                ),
                citations=cits,
                mode="fallback",
            )
        sy = currency_symbol(company)
        ann = latest_annual(company)
        quote = company.quote
        lines = [f"### {company.profile.name} ({company.profile.ticker}) — snapshot", ""]
        lines.append(
            f"- Sector **{company.profile.sector}** · market cap {fmt_num(quote.marketCap)} "
            f"({sy}{fmt_num(quote.price)}) · 52-wk {fmt_num(quote.low52Week)}–{fmt_num(quote.high52Week)}"
        )
        if ann:
            lines += [
                f"- Revenue {fmt_num(ann.revenue)} ({sy}) ; growth {compact_pct(ann.revenueGrowth)}",
                f"- Net margin {compact_pct(ann.netMargin)} ; operating margin {compact_pct(ann.operatingMargin)} ; ROE {compact_pct(ann.roe)}",
                f"- EPS {fmt_num(ann.eps)} ; debt/equity {fmt_float(ann.debtToEquity, 2)} ; interest cover {fmt_float(ann.interestCover)}x",
                f"- Free cash flow {fmt_num(ann.freeCashFlow)} ({sy}) ; dividend yield {compact_pct(ann.dividendYield)}",
                f"- Valuation: P/E {fmt_float(ann.peRatio)} ; P/B {fmt_float(ann.priceToBook, 2)} ; EV/EBITDA {fmt_float(ann.evToEbitda)}",
            ]
        lines += [
            "",
            "**Takeaway (rule-based):** read the latest filing's growth, margin and "
            "leverage figures together; no single metric decides a thesis. See the "
            "cited sources for the underlying statements.",
            "",
            _source_footer(cits),
        ]
        return AIReply(answer="\n".join(lines), citations=cits, mode="fallback")

    return fallback


async def run(ctx: AIContext, req: AIRequest) -> AIReply:
    ensure_llm(ctx)
    slug = req.company or (req.companies[0] if req.companies else "") or None
    company = await ctx.store.get_company(slug) if slug else None
    fallback = _company_fallback(company)
    return await grounded(
        ctx,
        req.question,
        SYSTEM,
        company=slug,
        limit=6,
        fallback=fallback,
    )