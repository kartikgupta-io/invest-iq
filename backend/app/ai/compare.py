"""Pure-data comparison engine.

Builds ECharts-friendly structured JSON from the stored company universe. No
LLM is ever invoked: every number is either read directly from the company
payload or derived deterministically from ``company.annual`` (CAGRs, margins,
cash-flow ratios).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.ai.metrics import build_metrics, parse_year
from app.data.contract import Company, DataStore

_DIMENSIONS: dict[str, list[tuple[str, str]]] = {
    "growth": [
        ("rev_cagr_3y", "Revenue CAGR (3Y)"),
        ("eps_cagr_3y", "EPS CAGR (3Y)"),
        ("revenue_growth", "Revenue growth (latest)"),
    ],
    "profitability": [
        ("net_margin", "Net margin"),
        ("operating_margin", "Operating margin"),
        ("roe", "ROE"),
        ("roce", "ROCE"),
    ],
    "cashflow": [
        ("ocf", "Operating cash flow"),
        ("fcf", "Free cash flow"),
        ("fcf_margin", "FCF margin"),
    ],
    "valuation": [
        ("market_cap", "Market cap"),
        ("pe", "P/E (latest)"),
        ("pb", "P/B"),
        ("ev_ebitda", "EV/EBITDA"),
        ("dividend_yield", "Dividend yield"),
    ],
    "balance": [
        ("total_debt", "Total debt"),
        ("net_debt", "Net debt"),
        ("debt_to_equity", "Debt/equity"),
        ("current_ratio", "Current ratio"),
        ("cash", "Cash"),
    ],
    "position": [
        ("sector", "Sector"),
        ("industry", "Industry"),
        ("market_cap", "Market cap"),
        ("employees", "Employees"),
        ("founded", "Founded"),
    ],
}


def _round3(value: float | int | None) -> float | None:
    """Round to 3 decimal places; ``None`` when the value is not a finite number."""
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number or number in (float("inf"), float("-inf")):
        return None
    return round(number, 3)


def _cagr(series: list[float], min_records: int = 3) -> float | None:
    """Compound annual growth between the first and last of ``series``.

    Returns ``None`` when fewer than ``min_records`` usable values exist, the
    first value is zero, or the series crosses signs (undefined geometric mean).
    """
    values = [v for v in series if isinstance(v, (int, float)) and v == v]
    if len(values) < min_records or values[0] == 0:
        return None
    first, last = values[0], values[-1]
    if first < 0 or last < 0:
        return None
    n = len(values) - 1
    try:
        return (last / first) ** (1 / n) - 1
    except (ZeroDivisionError, ValueError, OverflowError):
        return None


def _snapshot(company: Company) -> dict[str, Any]:
    """Extract one comparable value set per company from stored data."""
    annual = sorted(company.annual, key=lambda a: parse_year(a.year))
    latest = annual[-1] if annual else None
    revenues = [a.revenue for a in annual]
    eps = [a.eps for a in annual]

    def pct(fraction: float | None) -> float | None:
        if not isinstance(fraction, (int, float)) or fraction != fraction:
            return None
        return _round3(fraction * 100)

    fcf_margin = None
    if latest is not None and latest.revenue:
        fcf_margin = pct(latest.freeCashFlow / latest.revenue)

    return {
        "rev_cagr_3y": pct(_cagr(revenues[-3:])),
        "eps_cagr_3y": pct(_cagr(eps[-3:])),
        "revenue_growth": latest.revenueGrowth if latest else None,
        "net_margin": latest.netMargin if latest else None,
        "operating_margin": latest.operatingMargin if latest else None,
        "roe": latest.roe if latest else None,
        "roce": latest.roce if latest else None,
        "ocf": _round3(latest.operatingCashFlow) if latest else None,
        "fcf": _round3(latest.freeCashFlow) if latest else None,
        "fcf_margin": fcf_margin,
        "market_cap": _round3(company.quote.marketCap),
        "pe": latest.peRatio if latest else None,
        "pb": latest.priceToBook if latest else None,
        "ev_ebitda": latest.evToEbitda if latest else None,
        "dividend_yield": latest.dividendYield if latest else None,
        "total_debt": _round3(latest.totalDebt) if latest else None,
        "net_debt": _round3(latest.netDebt) if latest else None,
        "debt_to_equity": latest.debtToEquity if latest else None,
        "current_ratio": latest.currentRatio if latest else None,
        "cash": _round3(latest.cash) if latest else None,
        "sector": company.profile.sector,
        "industry": company.profile.industry,
        "employees": company.profile.employees,
        "founded": company.profile.founded,
    }


def _series(companies: dict[str, Company]) -> dict[str, list[dict[str, Any]]]:
    """Overlapping-year series for ``revenue`` and ``netIncome`` per symbol."""
    year_sets = [{a.year for a in company.annual} for company in companies.values()]
    overlap = set.intersection(*year_sets) if year_sets else set()
    years = sorted(overlap) if overlap else sorted(set().union(*year_sets))
    result: dict[str, list[dict[str, Any]]] = {}
    for metric in ("revenue", "netIncome"):
        points: list[dict[str, Any]] = []
        for year in years:
            point: dict[str, Any] = {"year": year}
            for slug, company in companies.items():
                by_year = {a.year: a for a in company.annual}
                record = by_year.get(year)
                point[slug] = _round3(getattr(record, metric)) if record is not None else None
            points.append(point)
        result[metric] = points
    return result


async def build_compare(store: DataStore, symbols: list[str]) -> dict:
    """Structured ECharts-friendly comparison for the given (resolved) symbols."""
    companies: dict[str, Company] = {}
    for symbol in symbols:
        company = await store.get_company(symbol)
        if company is not None:
            companies[symbol] = company

    slugs = list(companies)
    snapshots = {slug: _snapshot(company) for slug, company in companies.items()}

    tables: dict[str, list[dict[str, Any]]] = {}
    for dimension, specs in _DIMENSIONS.items():
        rows = []
        for key, label in specs:
            values = {slug: snapshots[slug].get(key) for slug in slugs}
            rows.append({"metric": label, "values": values})
        tables[dimension] = rows

    currency = "INR"
    if companies:
        currency = next(iter(companies.values())).profile.currency

    meta = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "InvestIQ stored filings & market data",
        "currency": currency,
        "count": len(slugs),
        "dimensions": list(_DIMENSIONS),
    }
    return {"symbols": slugs, "tables": tables, "series": _series(companies), "meta": meta}


def _num(value: float | None) -> str:
    if value is None or value != value:
        return "n/a"
    if abs(value) >= 1e7:
        return f"{value / 1e7:,.2f} Cr"
    if abs(value) >= 1e5:
        return f"{value / 1e5:,.2f} L"
    return f"{value:,.0f}"


def _fmt(value: float | None) -> str:
    if value is None or value != value:
        return "n/a"
    return f"{value:.2f}"


def _narrative(company: Company) -> str:
    snap = _snapshot(company)
    profile = company.profile
    lines = [
        f"### {profile.name} ({profile.ticker})",
        "",
        f"- **Sector/Industry:** {profile.sector} / {profile.industry}",
        f"- **Market cap:** {_num(snap['market_cap'])}; P/E {_fmt(snap['pe'])}; dividend yield {_fmt(snap['dividend_yield'])}%",
        f"- **Growth:** revenue 3Y CAGR {_fmt(snap['rev_cagr_3y'])}%; EPS 3Y CAGR {_fmt(snap['eps_cagr_3y'])}%; "
        f"latest revenue growth {_fmt(snap['revenue_growth'])}%",
        f"- **Profitability:** net margin {_fmt(snap['net_margin'])}%; operating margin {_fmt(snap['operating_margin'])}%; "
        f"ROE {_fmt(snap['roe'])}%; ROCE {_fmt(snap['roce'])}%",
        f"- **Cash flow:** operating cash flow {_num(snap['ocf'])}; free cash flow {_num(snap['fcf'])} "
        f"({_fmt(snap['fcf_margin'])}% margin)",
        f"- **Balance sheet:** total debt {_num(snap['total_debt'])}; net debt {_num(snap['net_debt'])}; "
        f"debt/equity {_fmt(snap['debt_to_equity'])}; current ratio {_fmt(snap['current_ratio'])}",
        "",
    ]
    return "\n".join(lines)


async def compare_summary(store: DataStore, symbols: list[str]) -> dict:
    """Markdown narrative per symbol plus the shared tables (reused by the API)."""
    data = await build_compare(store, symbols)
    narratives: dict[str, str] = {}
    for slug in data["symbols"]:
        company = await store.get_company(slug)
        if company is not None:
            narratives[slug] = _narrative(company)
    return {
        "symbols": data["symbols"],
        "narratives": narratives,
        "tables": data["tables"],
        "meta": data["meta"],
    }


async def resolve_symbols(store: DataStore, symbols: list[str]) -> list[str]:
    """Drop invalid slugs/tickers and guarantee a minimum of two symbols.

    Symbols are matched against stored slugs first, then case-insensitively
    against tickers (e.g. ``infy`` -> ``infosys``). When fewer than two valid
    symbols remain the top companies by market cap are added.
    """
    summaries = await store.list_companies()
    by_ticker = {summary.ticker.lower(): summary.slug for summary in summaries}
    valid: list[str] = []
    seen: set[str] = set()
    for raw in symbols:
        symbol = (raw or "").strip()
        if not symbol:
            continue
        slug = symbol
        if await store.get_company(slug) is None:
            slug = by_ticker.get(symbol.lower())
        if slug and slug not in seen:
            seen.add(slug)
            valid.append(slug)
    if len(valid) < 2:
        top = sorted(summaries, key=lambda s: -s.marketCap)[: min(3, len(summaries))]
        for summary in top:
            if summary.slug not in seen:
                seen.add(summary.slug)
                valid.append(summary.slug)
    return valid
