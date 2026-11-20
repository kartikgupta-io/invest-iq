"""Deterministic offline analyst.

Produces source-referenced, keyword-routed answers from computed metrics and
the company document base. Uses nothing but the data in the store — this is
the guarantee that every factual statement maps to a filing or trusted market
data source even with the model server turned off.
"""

from __future__ import annotations

import re

from app.ai.citations import company_context, retrieve
from app.ai.metrics import build_metrics, parse_year
from app.data.contract import Citation, DataStore

KNOWN_SLUGS = {
    "reliance",
    "tcs",
    "hdfcbank",
    "infy",
    "icicibank",
    "bhartiartl",
    "itc",
    "hindunilvr",
    "sbin",
    "tatamotors",
    "asianpaint",
    "wipro",
}

_TOKENIZE = re.compile(r"[a-z0-9]+")


def _num(value: float) -> str:
    if abs(value) >= 1e7:
        return f"{value / 1e7:,.2f} Cr"
    if abs(value) >= 1e5:
        return f"{value / 1e5:,.2f} L"
    return f"{value:,.0f}"


def slug_from(question: str) -> str:
    lowered = question.lower()
    tokens = set(_TOKENIZE.findall(lowered))
    for slug in KNOWN_SLUGS:
        if slug in tokens or slug in lowered:
            return slug
    return ""


def _ref(citations: list[Citation]) -> int:
    return 1 if citations else 0


def build_metrics_block(company, citations: list[Citation]) -> str:
    m = build_metrics(company)
    latest = m.trend[-1]
    period = f"FY{parse_year(latest.year)}"
    ref = _ref(citations)
    return (
        f"**{m.name} ({m.ticker})** — latest available report period {period}.\n"
        f"- Revenue {_num(m.revenue)} ; growth {m.revenue_growth:+.1f}% YoY ; 5-yr CAGR {m.revenue_cagr_5y:+.1f}% "
        f"[{ref}]\n"
        f"- Net margin {m.net_margin:.1f}% ; operating margin {m.operating_margin:.1f}% ; gross margin "
        f"{m.gross_margin:.1f}% [{ref}]\n"
        f"- ROE {m.roe:.1f}% ; ROCE {m.roce:.1f}% ; EPS {m.eps:.2f} [{ref}]\n"
        f"- Net debt/equity {m.debt_to_equity:.2f} ; current ratio {m.current_ratio:.2f} ; interest cover "
        f"{m.interest_cover:.1f}x [{ref}]\n"
        f"- Operating cash flow {_num(m.operating_cash_flow)} ; FCF {_num(m.free_cash_flow)} ; FCF margin "
        f"{m.fcf_margin:.1f}% [{ref}]\n"
        f"- Valuation: P/E {m.pe:.1f} ; P/B {m.pb:.1f} ; EV/EBITDA {m.ev_ebitda:.1f} ; dividend yield "
        f"{m.dividend_yield:.2f}% [{ref}]"
    )


def _topic(question: str) -> str:
    lowered = question.lower()
    if any(w in lowered for w in ("margin", "profitability", "efficiency")):
        return "profitability"
    if any(w in lowered for w in ("debt", "leverage", "liquidity", "balance sheet")):
        return "leverage"
    if any(w in lowered for w in ("cash flow", "cashflow", "free cash")):
        return "cashflow"
    if any(w in lowered for w in ("growth", "revenue", "topline")):
        return "growth"
    if any(w in lowered for w in ("valuation", "pe", "price", "expensive", "cheap", "fair value")):
        return "valuation"
    if any(w in lowered for w in ("risk", "threat", "concern")):
        return "risk"
    if any(w in lowered for w in ("roe", "return", "capital")):
        return "returns"
    return "general"


def _narrative(topic: str, m, citations: list[Citation]) -> str:
    ref = _ref(citations)
    if topic == "profitability":
        return (
            f"Profitability view [{ref}]: net margin of {m.net_margin:.1f}% with operating margin "
            f"{m.operating_margin:.1f}% and gross margin {m.gross_margin:.1f}%. Margins isolate the "
            f"price-vs-cost trade-off shown in {m.name}'s filings."
        )
    if topic == "leverage":
        return (
            f"Leverage view [{ref}]: net debt/equity of {m.debt_to_equity:.2f}, interest cover "
            f"{m.interest_cover:.1f}x and current ratio {m.current_ratio:.2f}. Debt/equity below 1.0 "
            f"with cover above 2x is generally treated as balance-sheet strength."
        )
    if topic == "cashflow":
        return (
            f"Cash-flow view [{ref}]: operating cash flow {_num(m.operating_cash_flow)} and free cash "
            f"flow {_num(m.free_cash_flow)} ({m.fcf_margin:.1f}% of revenue). Positive FCF funds "
            f"dividends (yield {m.dividend_yield:.2f}%), buy-backs and deleveraging."
        )
    if topic == "growth":
        return (
            f"Growth view [{ref}]: latest revenue growth {m.revenue_growth:+.1f}% YoY, 5-yr CAGR "
            f"{m.revenue_cagr_5y:+.1f}% and EPS compounding at {m.eps_growth:+.1f}%. Revenue grew in "
            f"{m.growth_pos_since} of the trailing periods."
        )
    if topic == "valuation":
        return (
            f"Valuation view [{ref}]: P/E {m.pe:.1f}, P/B {m.pb:.1f}, EV/EBITDA {m.ev_ebitda:.1f} and "
            f"dividend yield {m.dividend_yield:.2f}%. Read these ratios relative to sector peers, not "
            f"in isolation."
        )
    if topic == "risk":
        return (
            f"Risk view [{ref}]: the mechanical risks visible in the data are margin compression, "
            f"leverage (debt/equity {m.debt_to_equity:.2f}) and multiple compression (P/E {m.pe:.1f}). "
            f"Cross-check the qualitative factors in the latest management discussion."
        )
    if topic == "returns":
        return (
            f"Returns view [{ref}]: ROE {m.roe:.1f}%, ROCE {m.roce:.1f}% and ROA {m.roa:.1f}%. ROCE "
            f"isolates operating capital efficiency and is preferred across businesses with different "
            f"capital structures."
        )
    return (
        f"A balanced view of {m.name}: revenue {_num(m.revenue)} growing {m.revenue_growth:+.1f}% with "
        f"net margin {m.net_margin:.1f}%, ROE {m.roe:.1f}% and P/E {m.pe:.1f}. Weigh growth, margins, "
        f"leverage, cash generation and valuation together from the cited filings rather than any "
        f"single metric."
    )


def _dedup(citations: list[Citation]) -> list[Citation]:
    seen: set[str] = set()
    out: list[Citation] = []
    for citation in citations:
        if citation.id in seen:
            continue
        seen.add(citation.id)
        out.append(citation)
    return out[:6]


async def build_offline_answer(store: DataStore, question: str) -> tuple[str, list[Citation], str]:
    slug = slug_from(question)
    if not slug:
        summaries = await store.list_companies()
        covered = ", ".join(f"`{s.ticker}`" for s in summaries[:8])
        return (
            "I couldn't map your question to a covered company. Covered tickers: "
            + covered
            + ". Try e.g. `reliance revenue growth`, `tcs net margin`, or `risk analysis for ICICIBANK`.",
            [],
            "",
        )
    company = await store.get_company(slug)
    if company is None:
        return "That company wasn't found in the covered universe.", [], slug
    cites = await company_context(store, slug, limit=4)
    hits = await retrieve(store, question, limit=3)
    citations = _dedup(cites + hits)
    m = build_metrics(company)
    block = build_metrics_block(company, citations)
    narrative = _narrative(_topic(question), m, citations)
    answer = (
        f"{block}\n\n{narrative}\n\n_Offline mode: analysis derived from stored filings and market "
        f"data linked above; live-model reasoning is disabled._"
    )
    return answer, citations, slug


async def company_citations(store: DataStore, slug: str, limit: int = 4) -> list[Citation]:
    return await company_context(store, slug, limit)


class OfflineAnswerBuilder:
    """Adapts the deterministic offline answerer to the streaming provider.

    ``provider.get_llm`` constructs this with no store; a lazily built process
    singleton provides data access at call time.
    """

    async def __call__(self, messages: list[dict]) -> str:
        question = ""
        for message in reversed(messages):
            if message.get("role") == "user":
                question = message.get("content", "")
                break
        from app.data.store import get_store

        answer, _citations, _slug = await build_offline_answer(get_store(), question)
        return answer