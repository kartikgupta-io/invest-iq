"""``compare`` module — side-by-side company comparison.

Resolves ``req.companies`` (or derives a sector peer set from ``req.company``),
builds a structured metric table, and when the LLM is available writes a richer
narrative. Fallback is a deterministic markdown table plus a short rule-based
read-out. Citations are carried for the primary company.
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
    sources_markdown,
)
from app.ai.rag import grounded
from app.data.contract import Citation, Company

NAME = "compare"

SYSTEM = (
    "You are InvestIQ's comparative analyst. Compare the companies listed in "
    "the request across revenue growth, margins, profitability, leverage and "
    "valuation.\n"
    "Rules:\n"
    "1. Use ONLY the SOURCES block and the comparison context; never invent "
    "peer figures.\n"
    "2. Cite figures with the source index in brackets, e.g. 'Reliance's net "
    "margin is 7% vs TCS's 24% [1]'.\n"
    "3. Structure: headline verdict, a comparison per dimension, then 'which "
    "one stands out'.\n"
    "4. Say so explicitly if the SOURCES block is empty and the comparison "
    "relies on structured market data."
)

_METRICS = ("Revenue", "Growth", "Net margin", "ROE", "Debt/Eq", "P/E", "FCF")


def _metric_cells(company: Company) -> dict[str, str]:
    ann = latest_annual(company)
    sy = currency_symbol(company)
    if ann is None:
        return {m: "—" for m in _METRICS}
    return {
        "Revenue": f"{fmt_num(ann.revenue)} ({sy})",
        "Growth": compact_pct(ann.revenueGrowth),
        "Net margin": compact_pct(ann.netMargin),
        "ROE": compact_pct(ann.roe),
        "Debt/Eq": fmt_float(ann.debtToEquity, 2),
        "P/E": fmt_float(ann.peRatio),
        "FCF": f"{fmt_num(ann.freeCashFlow)} ({sy})",
    }


def _numeric(company: Company, metric: str) -> float | None:
    ann = latest_annual(company)
    if ann is None:
        return None
    fields = {
        "Revenue": ann.revenue,
        "Growth": ann.revenueGrowth,
        "Net margin": ann.netMargin,
        "ROE": ann.roe,
        "Debt/Eq": ann.debtToEquity,
        "P/E": ann.peRatio,
        "FCF": ann.freeCashFlow,
    }
    return fields[metric]


def _compare_table(companies: list[Company]) -> str:
    headers = ["Metric", *[f"{c.profile.ticker}" for c in companies]]
    cols = len(headers)
    lines = [
        "| " + " | ".join(headers) + " |",
        "|" + "---|" * cols,
    ]
    for metric in _METRICS:
        cells = [metric]
        for company in companies:
            cells.append(_metric_cells(company)[metric])
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


def _standout(companies: list[Company]) -> str:
    """Crude deterministic read: best growth, best margin, lowest P/E."""
    bullets = []
    for metric, higher_better in (("Growth", True), ("Net margin", True), ("ROE", True)):
        ranked = [
            (c.profile.name, _numeric(c, metric))
            for c in companies
            if _numeric(c, metric) is not None
        ]
        if not ranked:
            continue
        winner, value = max(ranked, key=lambda t: t[1]) if higher_better else min(ranked, key=lambda t: t[1])
        bullets.append(f"- **{winner}** leads on {metric.lower()} at {compact_pct(value)}.")
    return "\n".join(bullets)


def _compare_fallback(companies: list[Company]):
    def fallback(ctx: AIContext, citations: list[Citation]) -> AIReply:
        cits = cite(citations)
        if not companies:
            return AIReply(
                answer="Provide at least two companies (or a primary company whose "
                "sector peers can be compared).\n\n" + sources_markdown(cits),
                citations=cits,
                mode="fallback",
            )
        lines = [
            f"### Compare · {', '.join(c.profile.name for c in companies)}",
            "",
            _compare_table(companies),
            "",
            "**Who stands out (rule-based):**",
            "",
            _standout(companies),
            "",
            "> Balanced view: growth, margins and leverage must be read together; "
            "valuation should always be judged relative to sector peers.",
            "",
            sources_markdown(cits),
        ]
        return AIReply(answer="\n".join(lines), citations=cits, mode="fallback")

    return fallback


async def run(ctx: AIContext, req: AIRequest) -> AIReply:
    ensure_llm(ctx)
    slugs = list(req.companies)
    if not slugs and req.company:
        primary = await ctx.store.get_company(req.company)
        if primary is None:
            return AIReply(
                answer="The requested company is not in the covered universe; pass "
                "two `companies` slugs to compare.",
                citations=[],
                mode="fallback",
            )
        peers = await ctx.store.get_peer_group(req.company, 4)
        slugs = [req.company] + [p.slug for p in peers]
    if not slugs:
        return AIReply(
            answer="Provide `companies` (or a `company` slug) to run a comparison.",
            citations=[],
            mode="fallback",
        )
    companies: list[Company] = []
    for slug in slugs:
        company = await ctx.store.get_company(slug)
        if company is not None:
            companies.append(company)
    if len(companies) < 2:
        return AIReply(
            answer="Comparison needs at least two resolvable companies; "
            f"only {len(companies)} were found.",
            citations=[],
            mode="fallback",
        )
    primary = companies[0].profile.slug
    fallback = _compare_fallback(companies)
    return await grounded(ctx, req.question, SYSTEM, company=primary, limit=6, fallback=fallback)