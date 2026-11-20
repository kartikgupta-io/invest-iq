"""``summarizer`` module — annual report / quarterly report / earnings call.

Three run variants share ``_base_system(document_kind)``. The fallback is a
deterministic, section-based digest built from the last three fiscal periods
plus retrieved citations. ``run`` dispatches on the question text; the API layer
can also call ``annual``/``quarterly``/``earnings`` directly.
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
    sources_markdown,
    trailing_annual,
    year_key,
)
from app.ai.rag import grounded
from app.data.contract import Citation, Company, QuarterlyResult

NAME = "summarizer"


def _base_system(document_kind: str, company: str = "the company") -> str:
    return (
        f"You are InvestIQ's document summarizer for the **{document_kind}** of {company}. "
        "Produce a tight, structured markdown summary.\n"
        "Cover, in order:\n"
        "1. Business overview & operating context\n"
        "2. Revenue and EPS for the reporting period, with year-over-year change\n"
        "3. Margin trend (gross, operating, net)\n"
        "4. Debt, cash and liquidity position\n"
        "5. Outlook, guidance or management commentary as stated in the source\n"
        "Rules:\n"
        "- Use ONLY facts from the SOURCES block and the data in your instructions. "
        "Never invent figures, dates or guidance.\n"
        "- Cite every quantitative claim with the source number, e.g. 'revenue rose "
        "8% [1]'.\n"
        "- Keep headings short (##) and each section to 2-4 bullets.\n"
        "- If the SOURCES block is empty, say that the digest is computed from "
        "structured financial data rather than the raw document."
    )


SYSTEM = _base_system("Annual Report", "the company")

SYSTEM_ANNUAL = _base_system("Annual Report", "the company")
SYSTEM_QUARTERLY = _base_system("Quarterly Report", "the company")
SYSTEM_EARNINGS = _base_system("Earnings Call Transcript", "the company")


def _digest_fallback(kind: str):
    """Deterministic section-based digest when the LLM is unavailable."""

    def fallback(ctx: AIContext, citations: list[Citation]) -> AIReply:
        cits = cite(citations)
        company = getattr(ctx, "_summary_company", None)
        if company is None:
            return AIReply(
                answer="Pick a company to summarize — e.g. `summarize the annual report of reliance`.\n\n"
                + sources_markdown(cits),
                citations=cits,
                mode="fallback",
            )
        sy = currency_symbol(company)
        name = company.profile.name
        lines = [f"### {name} — {kind} digest (rule-based)", ""]
        if kind == "Annual Report":
            rows = trailing_annual(company, 3)
            if rows:
                lines.append("**Last three fiscal years**")
                lines.append("")
                lines.append("| Period | Revenue | Growth | Net income | EPS | Net margin | Debt/Eq |")
                lines.append("|:--|--:|--:|--:|--:|--:|--:|")
                for a in rows:
                    lines.append(
                        f"| {a.year} | {fmt_num(a.revenue)} | {compact_pct(a.revenueGrowth)} "
                        f"| {fmt_num(a.netIncome)} | {fmt_num(a.eps)} | {compact_pct(a.netMargin)} "
                        f"| {fmt_float(a.debtToEquity, 2)} |"
                    )
                last = rows[-1]
                lines += [
                    "",
                    f"**Revenue & EPS:** revenue {fmt_num(last.revenue)} ({sy}) in {last.year} "
                    f"({compact_pct(last.revenueGrowth)} YoY); EPS {fmt_num(last.eps)}.",
                    f"**Margins:** net {compact_pct(last.netMargin)}, operating {compact_pct(last.operatingMargin)}.",
                    f"**Debt & cash:** total debt {fmt_num(last.totalDebt)} ({sy}), net debt "
                    f"{fmt_num(last.netDebt)} ({sy}), cash {fmt_num(last.cash)} ({sy}); "
                    f"debt/equity {fmt_float(last.debtToEquity, 2)}, interest cover {fmt_float(last.interestCover)}x.",
                ]
        elif kind == "Quarterly Report":
            quarters = _recent_quarters(company)
            if quarters:
                lines.append("**Recent quarters**")
                lines.append("")
                lines.append("| Period | Quarter | Revenue | Net income | EPS | Margin |")
                lines.append("|:--|:--|--:|--:|--:|--:|")
                for fy, q in quarters[:6]:
                    lines.append(
                        f"| {fy} | {q.quarter} | {fmt_num(q.revenue)} | {fmt_num(q.netIncome)} "
                        f"| {fmt_num(q.eps)} | {compact_pct(q.margin)} |"
                    )
                latest = quarters[0][1]
                lines += [
                    "",
                    f"**Latest quarter ({quarters[0][0]} {latest.quarter}):** revenue "
                    f"{fmt_num(latest.revenue)} ({sy}), net income {fmt_num(latest.netIncome)}, "
                    f"EPS {fmt_num(latest.eps)}, margin {compact_pct(latest.margin)}.",
                ]
            else:
                lines.append("_No quarterly breakdown available for this company._")
        else:  # Earnings Call
            transcript = next(
                (d for d in company.documents if "Earnings Call" in (d.type or "")),
                None,
            )
            lines.append("**Management commentary**")
            md = (company.managementDiscussion or "").strip()
            lines.append(f"- {md[:500]}" if md else "- _No management discussion in the dataset._")
            if transcript:
                lines.append(
                    f"- Cited transcript: *{transcript.title}* ({transcript.source}, "
                    f"filed {transcript.filedDate}) — see the SOURCES block."
                )
            rows = trailing_annual(company, 2)
            if len(rows) == 2:
                yoy = rows[-1].revenueGrowth
                lines.append(
                    f"- Latest fiscal year grew {compact_pct(yoy)} in revenue; EPS "
                    f"{fmt_num(rows[-1].eps)}."
                )
        lines += ["", sources_markdown(cits)]
        return AIReply(answer="\n".join(lines), citations=cits, mode="fallback")

    return fallback


def _recent_quarters(company: Company, limit: int = 6) -> list[tuple[str, QuarterlyResult]]:
    out: list[tuple[str, QuarterlyResult]] = []
    for fy in sorted(company.quarterly, key=year_key, reverse=True):
        for q in sorted(company.quarterly[fy], key=lambda q: (q.endDate or ""), reverse=True):
            out.append((fy, q))
    return out[:limit]


async def _summarize(
    ctx: AIContext,
    req: AIRequest,
    kind: str,
    system: str,
) -> AIReply:
    ensure_llm(ctx)
    slug = req.company or (req.companies[0] if req.companies else "") or None
    company = await ctx.store.get_company(slug) if slug else None
    fallback = _digest_fallback(kind)
    ctx._summary_company = company  # type: ignore[attr-defined]
    try:
        return await grounded(ctx, req.question, system, company=slug, limit=6, fallback=fallback)
    finally:
        if hasattr(ctx, "_summary_company"):
            del ctx._summary_company


async def annual(ctx: AIContext, req: AIRequest) -> AIReply:
    return await _summarize(ctx, req, "Annual Report", SYSTEM_ANNUAL)


async def quarterly(ctx: AIContext, req: AIRequest) -> AIReply:
    return await _summarize(ctx, req, "Quarterly Report", SYSTEM_QUARTERLY)


async def earnings(ctx: AIContext, req: AIRequest) -> AIReply:
    return await _summarize(ctx, req, "Earnings Call Transcript", SYSTEM_EARNINGS)


async def run(ctx: AIContext, req: AIRequest) -> AIReply:
    """Dispatch on question hints: "quarter", "call" (earnings), else annual."""
    lowered = (req.question or "").lower()
    if "quarter" in lowered:
        return await quarterly(ctx, req)
    if "call" in lowered:
        return await earnings(ctx, req)
    return await annual(ctx, req)