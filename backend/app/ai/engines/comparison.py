"""Company comparison engine.

Builds a side-by-side metrics matrix, chart specs, and a peer-referenced
narrative for 2–6 companies. All numbers are drawn from the stored data; each
company is grounded with a citation to its latest filing.
"""

from __future__ import annotations

from app.ai.citations import company_context
from app.ai.metrics import build_metrics
from app.ai.schemas import Citation, ComparisonResponse, MetricRow
from app.data.contract import Company, DataStore

_CATEGORIES: list[tuple[str, str, str]] = [
    ("revenue_growth", "Revenue growth YoY (%)", "high"),
    ("revenue_cagr_5y", "Revenue 5Y CAGR (%)", "high"),
    ("net_margin", "Net margin (%)", "high"),
    ("operating_margin", "Operating margin (%)", "high"),
    ("roe", "ROE (%)", "high"),
    ("roce", "ROCE (%)", "high"),
    ("debt_to_equity", "Net debt/equity (x)", "low"),
    ("current_ratio", "Current ratio (x)", "high"),
    ("fcf_margin", "FCF margin (%)", "high"),
    ("pe", "P/E (x)", "low"),
    ("pb", "P/B (x)", "low"),
    ("ev_ebitda", "EV/EBITDA (x)", "low"),
    ("dividend_yield", "Dividend yield (%)", "high"),
]


async def compare(store: DataStore, symbols: list[str]) -> ComparisonResponse:
    entries: list[Company] = []
    for symbol in symbols:
        company = await store.get_company(symbol)
        if company is not None:
            entries.append(company)
    entries.sort(key=lambda c: c.quote.marketCap, reverse=True)

    if not entries:
        return ComparisonResponse(
            symbols=symbols,
            names=[],
            rows=[],
            charts=[],
            narrative="None of the requested symbols are in the covered universe.",
            citations=[],
        )

    metrics = [build_metrics(c) for c in entries]
    rows = [_metric_row(attr, label, best, metrics) for attr, label, best in _CATEGORIES]
    charts = [_trend_charts(entries)]
    citations = await _grounded(store, entries)
    return ComparisonResponse(
        symbols=[c.profile.slug for c in entries],
        names=[c.profile.name for c in entries],
        rows=rows,
        charts=charts,
        narrative=_narrative(metrics),
        citations=citations,
    )


def _metric_row(attr, label, best_is, metrics) -> MetricRow:
    def getter(m):
        value = getattr(m, attr)
        return value if isinstance(value, (int, float)) and value == value else 0.0

    values = [getter(m) for m in metrics]
    if best_is == "high":
        index = min(range(len(values)), key=lambda i: -values[i])
    else:
        index = min(range(len(values)), key=lambda i: values[i])
    return MetricRow(metric=label, values=values, companyIndex=index, bestIs="high" if best_is == "high" else "low")


def _trend_charts(entries) -> dict:
    years = sorted({a.year for c in entries for a in c.annual})
    return {
        "type": "line",
        "title": "Net margin trend (%)",
        "labels": years,
        "series": [
            {"name": c.profile.name, "data": [round(a.netMargin * 100, 2) for a in sorted(c.annual, key=lambda x: x.year)]}
            for c in entries
        ],
    }


def _narrative(metrics) -> str:
    names = [m.name for m in metrics]
    growth = max(metrics, key=lambda m: m.revenue_growth)
    margin = max(metrics, key=lambda m: m.net_margin)
    levered = max(metrics, key=lambda m: m.debt_to_equity)
    cheapest = min(metrics, key=lambda m: m.pe or 1e9)
    return (
        f"Of {', '.join(names)}, {growth.name} grew fastest ({growth.revenue_growth:+.1f}% YoY, 5Y CAGR "
        f"{growth.revenue_cagr_5y:+.1f}%). {margin.name} shows the highest net margin "
        f"({margin.net_margin:.1f}%) and {cheapest.name} trades at the lowest P/E ({cheapest.pe:.1f}). "
        f"{levered.name} carries the most leverage at {levered.debt_to_equity:.2f}x net debt/equity. "
        f"These are starting points; per-metric values are in the table and the chart is drawn from "
        f"the filings cited below."
    )


async def _grounded(store: DataStore, entries: list[Company]) -> list[Citation]:
    citations: list[Citation] = []
    for entry in entries:
        citations.extend(await company_context(store, entry.profile.slug, limit=1))
    return citations[:8]