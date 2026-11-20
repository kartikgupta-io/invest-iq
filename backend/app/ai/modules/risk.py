"""``risk`` module — strengths / weaknesses / risk profile of a company.

The fallback computes severity-tagged risk bullets deterministically from the
financials (debtToEquity, netDebt, cash, margin trend, growth deceleration,
interest coverage) plus the company's own ``riskFactors``.
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
    trailing_annual,
)
from app.ai.rag import grounded
from app.data.contract import Citation, Company

NAME = "risk"

SYSTEM = (
    "You are InvestIQ's risk & governance analyst. Profile the company's "
    "strengths, weaknesses and risks with severity labels.\n"
    "Rules:\n"
    "1. Use ONLY facts from the SOURCES block plus the financial context; never "
    "invent balances, ratios or events.\n"
    "2. Cite every number with the source index in brackets, e.g. 'debt/equity "
    "0.3 with interest cover 8.9x [1]'.\n"
    "3. For each risk state the severity (**High**/**Medium**/**Low**) and the "
    "evidence that supports it.\n"
    "4. Keep it balanced: list strengths as well as risks. Use markdown headings. "
    "If the SOURCES block is empty, say the assessment is computed from structured "
    "financial data, not the raw document."
)


def _risk_items(company: Company) -> list[tuple[str, str, str]]:
    """Return ``[(severity, title, detail)]`` computed from structured data."""
    latest = latest_annual(company)
    if latest is None:
        return []
    rows = trailing_annual(company, 3)
    margins = [a.netMargin for a in rows if a.netMargin is not None]
    growths = [a.revenueGrowth for a in rows if a.revenueGrowth is not None]

    de = latest.debtToEquity or 0.0
    cover = latest.interestCover or 0.0
    net_debt = latest.netDebt or 0.0
    cash = latest.cash or 0.0

    items: list[tuple[str, str, str]] = []
    if de >= 1.5:
        items.append(("high", "Leverage",
                      f"Debt/equity of {de:.2f} is elevated; interest cover {cover:.1f}x limits headroom."))
    elif de >= 1.0:
        items.append(("medium", "Leverage",
                      f"Debt/equity of {de:.2f} signals meaningful financial leverage."))
    else:
        items.append(("low", "Leverage", f"Comfortable balance sheet: debt/equity {de:.2f}."))

    if net_debt > 0 and cash > 0 and net_debt / cash > 1.5:
        items.append(("high", "Net debt vs cash",
                      f"Net debt of {fmt_num(net_debt)} outweighs cash of {fmt_num(cash)}."))
    else:
        items.append(("low", "Net debt position",
                      f"Net debt {fmt_num(net_debt)} vs cash {fmt_num(cash)}."))

    if growths and growths[-1] < 0:
        items.append(("high", "Revenue contraction", f"Latest revenue change is {compact_pct(growths[-1])}."))
    elif len(growths) >= 2 and growths[-1] < growths[0] - 2.0:
        items.append(("medium", "Growth deceleration",
                      f"Revenue growth slowed from {compact_pct(growths[0])} to {compact_pct(growths[-1])}."))
    else:
        items.append(("low", "Growth", f"Latest revenue growth {compact_pct(growths[-1]) if growths else '—'}."))

    if len(margins) >= 2 and margins[-1] < margins[0] - 2.0:
        items.append(("medium", "Margin compression",
                      f"Net margin fell from {compact_pct(margins[0])} to {compact_pct(margins[-1])}."))
    else:
        items.append(("low", "Margins", f"Net margin {compact_pct(margins[-1]) if margins else '—'}."))

    if cover < 2.0:
        items.append(("high", "Interest cover",
                      f"Interest cover of {cover:.1f}x barely covers finance costs."))
    else:
        items.append(("low", "Interest cover", f"Interest cover {cover:.1f}x is healthy."))
    return items


def _risk_fallback(company: Company | None):
    """Deterministic risk bullets with severity + sourced numbers."""

    def fallback(ctx: AIContext, citations: list[Citation]) -> AIReply:
        cits = cite(citations)
        if company is None:
            return AIReply(
                answer="Pick a company to run a risk profile, e.g. `risk of reliance`.\n\n"
                + sources_markdown(cits),
                citations=cits,
                mode="fallback",
            )
        sy = currency_symbol(company)
        items = _risk_items(company)
        latest = latest_annual(company)
        lines = [f"### {company.profile.name} ({company.profile.ticker}) — risk profile", ""]
        for sev, title, detail in items:
            lines.append(f"- **[{sev.capitalize()}] {title}:** {detail} [{1 if cits else ''}]")
        if latest:
            lines += [
                "",
                f"**Balance sheet context:** debt/equity {fmt_float(latest.debtToEquity, 2)}, "
                f"net debt {fmt_num(latest.netDebt)} ({sy}), cash {fmt_num(latest.cash)} ({sy}).",
            ]
        lines += ["", "## Risk factors (from disclosure)"]
        if company.riskFactors:
            for r in company.riskFactors[:5]:
                lines.append(f"- **{r.title}** ({r.severity}): {r.description}")
        else:
            lines.append("_No risk factors listed in the dataset._")
        lines += ["", sources_markdown(cits)]
        return AIReply(answer="\n".join(lines), citations=cits, mode="fallback")

    return fallback


async def run(ctx: AIContext, req: AIRequest) -> AIReply:
    ensure_llm(ctx)
    slug = req.company or (req.companies[0] if req.companies else "") or None
    company = await ctx.store.get_company(slug) if slug else None
    fallback = _risk_fallback(company)
    return await grounded(ctx, req.question, SYSTEM, company=slug, limit=6, fallback=fallback)