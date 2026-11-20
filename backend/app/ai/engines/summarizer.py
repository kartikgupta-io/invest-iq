"""Report summarizer.

Annual Report, Quarterly Report and Earnings Call analysers share one engine;
the section mix adapts to the document type. Output is grounded in the
document's own chunks and the company's computed financials.
"""

from __future__ import annotations

from app.ai.citations import file_citation
from app.ai.metrics import build_metrics, parse_year
from app.ai.schemas import AnalysisSection, SummaryResponse
from app.data.contract import DataStore


def _cr(value: float) -> str:
    return f"{value / 1e7:,.2f} Cr" if abs(value) >= 1e7 else f"{value:,.0f}"


async def summarize(store: DataStore, document_id: str) -> SummaryResponse:
    company = None
    document = None
    for slug in await _all_slugs(store):
        candidate = await store.get_company(slug)
        if candidate is None:
            continue
        document = next((d for d in candidate.documents if d.id == document_id), None)
        if document is not None:
            company = candidate
            break
    if document is None or company is None:
        return SummaryResponse(
            documentId=document_id,
            title="Unknown document",
            type="",
            sections=[],
            keyMetrics=[],
            citations=[],
        )

    chunks = await store.get_document_chunks(document_id)
    citation = await file_citation(store, document_id)
    citations = [citation] if citation else []
    m = build_metrics(company)
    latest = m.trend[-1]
    low = (document.type or "").lower()

    sections = [
        _section("Executive summary", _executive(m, latest)),
        _section("Business overview", _overview(m)),
        _section("Key financials", _key(m, latest)),
        _section("Risks & outlook", _outlook(m)),
    ]
    if "annual" in low:
        sections.append(_section("Cash-flow & dividend detail", _cashflow(m)))
    elif "earnings call" in low or "transcript" in low:
        sections.append(_section("Management commentary (transcript)", _transcript_points(chunks)))
    else:
        sections.append(_section("Quarterly trajectory", _quarterly_points(m.trend)))

    return SummaryResponse(
        documentId=document_id,
        title=document.title,
        type=document.type,
        sections=sections,
        keyMetrics=m.trend[-4:],
        citations=citations,
    )


def _section(title: str, points: list[str]) -> AnalysisSection:
    return AnalysisSection(title=title, points=points)


def _executive(m, latest) -> list[str]:
    return [
        f"{m.name} reported revenue of {_cr(m.revenue)} in FY{parse_year(latest.year)}.",
        f"The margin set (net {m.net_margin:.1f}%, operating {m.operating_margin:.1f}%) and returns "
        f"(ROE {m.roe:.1f}%) underpin its capital-allocation narrative.",
    ]


def _overview(m) -> list[str]:
    return [
        f"{m.name} ({m.ticker}) operates in the {m.sector} sector; the data covers {m.years} fiscal "
        f"years from the filings in the store.",
        f"Latest price {m.price:.2f} is {'above' if m.change_pct >= 0 else 'below'} its prior close by "
        f"{abs(m.change_pct):.2f}% and the 52-week range spans {m.low52:.2f}–{m.high52:.2f}.",
    ]


def _key(m, latest) -> list[str]:
    return [
        f"Revenue grew {m.revenue_growth:+.1f}% YoY and EPS compounded at {m.eps_growth:+.1f}% over five years.",
        f"Net margin {m.net_margin:.1f}%; operating margin {m.operating_margin:.1f}%; gross margin {m.gross_margin:.1f}%.",
        f"ROE {m.roe:.1f}%; ROCE {m.roce:.1f}%; EPS {m.eps:.2f} in FY{parse_year(latest.year)}.",
    ]


def _outlook(m) -> list[str]:
    return [
        f"Balance-sheet position: net debt/equity {m.debt_to_equity:.2f}x with interest cover "
        f"{m.interest_cover:.1f}x and current ratio {m.current_ratio:.2f}.",
        f"Cash generation is {m.fcf_margin:.1f}% of revenue; forward risks centre on margin "
        f"sustainability and multiple compression (P/E {m.pe:.1f}).",
    ]


def _cashflow(m) -> list[str]:
    return [
        f"Operating cash flow {_cr(m.operating_cash_flow)}; free cash flow {_cr(m.free_cash_flow)}; "
        f"dividend yield {m.dividend_yield:.2f}%.",
    ]


def _quarterly_points(trend) -> list[str]:
    recent = trend[-4:]
    return [f"Quarter to FY{parse_year(a.year)}: revenue {_cr(a.revenue)}, EPS {a.eps:.2f}" for a in recent]


def _transcript_points(chunks) -> list[str]:
    if not chunks:
        return ["No transcript chunks are available for this document."]
    return [f"(p.{c.page}) {' '.join(c.text.split())[:200]}" for c in chunks[:5]]


async def _all_slugs(store) -> list[str]:
    return [c.slug for c in await store.list_companies()]