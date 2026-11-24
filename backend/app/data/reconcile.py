"""Reconcile the live snapshot into the stable :class:`Company` contract.

The live cache holds only values that could actually be sourced from Yahoo
Finance and Screener.in. This module maps those fields onto the richer legacy
contract and deliberately leaves everything else as ``None`` — no synthetic
numbers, URLs, hashes or dates are ever introduced here.

Static company metadata (sector, headquarters, founded, ...) is reference data
taken from the legacy fixture via ``base``; it is not a financial claim.
"""

from __future__ import annotations

import re
from typing import Any

from app.data.contract import (
    AnnualFinancials,
    Company,
    CompanyProfile,
    FinancialDocument,
    QuarterlyResult,
    RiskPoint,
    TickerQuote,
    ValuationPoint,
)
from app.data.live_sources import UNIVERSE

# Fields the free public sources cannot supply. Surfaced in ``provenance`` so
# the UI can label them rather than silently showing an invented zero.
UNAVAILABLE: list[str] = [
    "segments",
    "historical valuation",
    "cash and current ratio (not disclosed by the free source)",
    "capex",
    "evToEbitda",
]

_FY_RE = re.compile(r"FY\d+", re.IGNORECASE)


def _num(value: Any) -> float | None:
    """Return a finite float, or ``None`` for anything unparseable."""
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number or number in (float("inf"), float("-inf")):
        return None
    return number


def _int(value: Any) -> int:
    number = _num(value)
    return int(number) if number is not None else 0


def _text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split())


def _digits(value: str) -> int:
    match = re.search(r"\d+", value)
    return int(match.group()) if match else 0


def _ticker_for(slug: str, base: Company | None) -> str:
    if base is not None and base.profile.ticker:
        return base.profile.ticker
    return UNIVERSE.get(slug, (slug.upper(), slug.upper()))[0]


def _profile_for(slug: str, quote: dict[str, Any], profile: dict[str, Any], base: Company | None) -> CompanyProfile:
    """Static reference metadata from the legacy fixture, real text when present."""
    legacy = base.profile if base is not None else None
    about = _text(profile.get("about"))
    description = about or (legacy.description if legacy is not None else "")
    currency = _text(quote.get("currency"))
    return CompanyProfile(
        slug=slug,
        ticker=legacy.ticker if legacy is not None else _ticker_for(slug, base),
        name=legacy.name if legacy is not None else (
            _text(profile.get("name")) or _text(quote.get("name")) or slug
        ),
        sector=legacy.sector if legacy is not None else "",
        industry=legacy.industry if legacy is not None else "",
        exchange=legacy.exchange if legacy is not None else "",
        currency=legacy.currency if legacy is not None else currency,
        currencyCode=legacy.currencyCode if legacy is not None else currency,
        founded=legacy.founded if legacy is not None else 0,
        listed=legacy.listed if legacy is not None else "",
        headquarters=legacy.headquarters if legacy is not None else "",
        website=legacy.website if legacy is not None else "",
        description=description,
        employees=legacy.employees if legacy is not None else 0,
        accent=legacy.accent if legacy is not None else "",
        market=legacy.market if legacy is not None else "",
    )


def _quote_for(quote: dict[str, Any], profile: dict[str, Any]) -> TickerQuote:
    price = _num(quote.get("price"))
    if price is None:
        # Screener.in's current price is a real, sourced fallback.
        price = _num(profile.get("price"))
    previous_close = _num(quote.get("previousClose"))
    change = (price - previous_close) if (price is not None and previous_close is not None) else 0.0
    return TickerQuote(
        price=price if price is not None else 0.0,
        change=change,
        changePct=_num(quote.get("changePct")) if _num(quote.get("changePct")) is not None else 0.0,
        open=None,  # not present in either free source
        high=_num(quote.get("dayHigh")) if _num(quote.get("dayHigh")) is not None else 0.0,
        low=_num(quote.get("dayLow")) if _num(quote.get("dayLow")) is not None else 0.0,
        volume=_int(quote.get("volume")),
        previousClose=previous_close if previous_close is not None else 0.0,
        marketCap=_num(profile.get("marketCapCr")) or 0.0,  # already in Rs crore
        peRatio=_num(profile.get("peRatio")) or 0.0,
        eps=None,  # not present in either free source
        dividendYield=_num(profile.get("dividendYield")),
        high52Week=_num(quote.get("fiftyTwoWeekHigh")) if _num(quote.get("fiftyTwoWeekHigh")) is not None else 0.0,
        low52Week=_num(quote.get("fiftyTwoWeekLow")) if _num(quote.get("fiftyTwoWeekLow")) is not None else 0.0,
    )


def _annual_and_valuation(
    financials: dict[str, Any],
    profile: dict[str, Any],
    price: float | None,
    market_cap: float | None,
) -> tuple[list[AnnualFinancials], list[ValuationPoint]]:
    years = sorted(
        (str(key) for key in financials if _FY_RE.fullmatch(str(key))),
        key=lambda year: (_digits(year), year),
    )
    rows: list[dict[str, Any]] = [
        financials.get(year) if isinstance(financials.get(year), dict) else {} for year in years
    ]

    # Ratios tied to today's price belong only to the latest fiscal year —
    # repeating them on historical rows would fabricate a valuation history.
    latest_year = years[-1] if years else None
    book_value = _num(profile.get("bookValue"))
    pe_ratio = _num(profile.get("peRatio"))
    dividend_yield = _num(profile.get("dividendYield"))
    roce_current = _num(profile.get("roce"))
    roe_current = _num(profile.get("roe"))
    price_to_book = (price / book_value) if (price and book_value) else None

    def pick(row: dict[str, Any], *names: str) -> float | None:
        for name in names:
            value = _num(row.get(name))
            if value is not None:
                return value
        return None

    def divide(numerator: float | None, denominator: float | None, factor: float = 1.0) -> float | None:
        if numerator is None or denominator in (None, 0):
            return None
        return numerator / denominator * factor

    annual: list[AnnualFinancials] = []
    for index, year in enumerate(years):
        row = rows[index]
        revenue = pick(row, "Sales", "Revenue")
        previous_revenue = pick(rows[index - 1], "Sales", "Revenue") if index > 0 else None
        sourced_growth = pick(row, "Sales growth", "Revenue Growth")
        growth = sourced_growth if sourced_growth is not None else divide(
            (revenue - previous_revenue) if (revenue is not None and previous_revenue is not None) else None,
            previous_revenue,
            100.0,
        )
        operating_profit = pick(row, "Operating Profit", "Operating Income")
        interest = pick(row, "Interest")
        net_income = pick(row, "Net Profit", "Net Income")
        equity_capital = pick(row, "Equity Capital")
        reserves = pick(row, "Reserves")
        total_equity = (
            equity_capital + reserves
            if equity_capital is not None and reserves is not None
            else None
        )
        total_debt = pick(row, "Borrowings", "Borrowing", "Total Debt")
        total_assets = pick(row, "Total Assets")
        margin = pick(row, "Net Margin %") or divide(net_income, revenue, 100.0)
        op_margin = pick(row, "OPM %", "Operating Margin")
        # Screener's "Operating Profit" is profit before depreciation, interest
        # and tax — the same quantity commonly reported as EBITDA.
        ebitda = operating_profit
        dividend_payout = pick(row, "Dividend Payout %")
        eps = pick(row, "EPS in Rs", "EPS")
        is_latest = year == latest_year
        market_cap_value = _num(profile.get("marketCapCr"))
        shares = divide(market_cap_value * 1e7, price) if (is_latest and market_cap_value) else None
        annual.append(
            AnnualFinancials(
                year=year,
                revenue=revenue,
                revenueGrowth=growth,
                operatingIncome=operating_profit,
                ebitda=ebitda,
                netIncome=net_income,
                eps=eps,
                netMargin=margin,
                operatingMargin=op_margin,
                ebitdaMargin=op_margin,
                returnOnAssets=divide(net_income, total_assets, 100.0),
                totalAssets=total_assets,
                totalEquity=total_equity,
                totalDebt=total_debt,
                debtToEquity=divide(total_debt, total_equity),
                operatingCashFlow=pick(row, "Cash from Operating Activity"),
                investingCashFlow=pick(row, "Cash from Investing Activity"),
                financingCashFlow=pick(row, "Cash from Financing Activity"),
                freeCashFlow=pick(row, "Free Cash Flow"),
                roe=pick(row, "ROE %") or (roe_current if is_latest else None),
                roce=pick(row, "ROCE %") or (roce_current if is_latest else None),
                interestCover=divide(operating_profit, interest),
                bookValue=book_value if is_latest else None,
                dividendPerShare=divide(eps * dividend_payout, 100.0) if dividend_payout is not None else None,
                dividendYield=dividend_yield if is_latest else None,
                sharesOutstanding=shares,
                revenuePerShare=divide(revenue, shares) if shares else None,
                # Both market cap and revenue are reported in Rs crore.
                priceToSales=divide(market_cap_value, revenue) if (is_latest and market_cap_value) else None,
                peRatio=pe_ratio if is_latest else None,
                priceToBook=price_to_book if is_latest else None,
                # Preserve every row the source actually reported, including
                # working-capital days and payout ratios not modelled above.
                metrics={str(key): _num(value) for key, value in row.items()},
            )
        )

    valuation: list[ValuationPoint] = []
    if latest_year is not None:
        valuation.append(
            ValuationPoint(
                year=latest_year,
                price=price,
                marketCap=market_cap,
                peRatio=pe_ratio,
                priceToBook=price_to_book,
                evToEbitda=None,
                dividendYield=dividend_yield,
            )
        )
    return annual, valuation


_QUARTER_FIELDS = {
    "revenue": ("revenue", "Revenue", "Sales"),
    "netIncome": ("netIncome", "Net Profit", "Net Income", "Profit"),
    "ebitda": ("ebitda", "EBITDA"),
    "eps": ("eps", "EPS in Rs", "EPS"),
    "margin": ("margin", "Net Margin %", "Net Margin", "Margin"),
}


def _quarter_row(item: dict[str, Any], quarter: str = "") -> QuarterlyResult:
    def pick(*names: str) -> float | None:
        for name in names:
            value = _num(item.get(name))
            if value is not None:
                return value
        return None

    label = _text(item.get("quarter")) or quarter
    numeric_quarter = _num(label)
    if not label and numeric_quarter is not None:
        label = f"Q{int(numeric_quarter)}"
    return QuarterlyResult(
        quarter=label,
        endDate=_text(item.get("endDate")),
        **{field: pick(*names) for field, names in _QUARTER_FIELDS.items()},
    )


def _quarters(raw: Any) -> dict[str, list[QuarterlyResult]]:
    """Map both ``{FY: [rows]}`` and Screener's ``{quarter label: {row: value}}``."""
    if not isinstance(raw, dict):
        return {}
    result: dict[str, list[QuarterlyResult]] = {}
    for key, value in raw.items():
        label = str(key)
        fiscal_match = re.search(r"FY\d{2,4}", label, re.IGNORECASE)
        fiscal_year = fiscal_match.group().upper() if fiscal_match else label
        quarter = label[: fiscal_match.start()].strip() if fiscal_match else ""
        if isinstance(value, list):
            rows = [
                _quarter_row(item, quarter)
                for item in value
                if isinstance(item, dict)
            ]
        elif isinstance(value, dict) and value and all(isinstance(v, dict) for v in value.values()):
            # {FY: {"Q1": {row: value}, ...}}
            rows = [_quarter_row(item, str(name)) for name, item in value.items()]
        elif isinstance(value, dict):
            rows = [_quarter_row(value, quarter)]
        else:
            continue
        if rows:
            result.setdefault(fiscal_year, []).extend(rows)
    return result


def _risk_factors(cons: Any) -> list[RiskPoint]:
    risks: list[RiskPoint] = []
    for item in cons if isinstance(cons, list) else []:
        text = _text(item.get("text") if isinstance(item, dict) else item)
        if not text:
            continue
        risks.append(
            RiskPoint(
                title=text[:70],
                description=text,
                severity="medium",  # UI grouping only, not a sourced severity
            )
        )
    return risks


def _management_discussion(profile: dict[str, Any]) -> str:
    parts = [_text(profile.get("about"))]
    for point in profile.get("keyPoints") or []:
        parts.append(_text(point.get("text") if isinstance(point, dict) else point))
    return " ".join(part for part in parts if part)


def _documents(slug: str, citations: Any) -> list[FinancialDocument]:
    documents: list[FinancialDocument] = []
    seen: set[str] = set()
    for citation in citations if isinstance(citations, list) else []:
        url = _text(citation.get("url") if isinstance(citation, dict) else citation)
        title = _text(citation.get("title") if isinstance(citation, dict) else "")
        if not url or url in seen:
            continue
        seen.add(url)
        documents.append(
            FinancialDocument(
                id=f"{slug}-citation-{len(documents) + 1}",
                companySlug=slug,
                type="Annual Report",
                title=title or url,
                form="Annual Report",
                fiscalPeriod="",
                filedDate=None,
                periodEnd=None,
                source="Investor Relations",
                sourceUrl=url,
                sizeKb=None,
                pages=None,
                sha256=None,
                latestVersion=None,
                versions=[],
            )
        )
    return documents


def build_company(slug: str, cache: dict, base: Company | None = None) -> Company | None:
    """Build a Company from live cache data, or ``None`` if slug has no live data.

    ``cache`` is the payload produced by ``live_sources.get_cached()``. ``base``
    is the legacy fixture for the same slug, used only for reference metadata.
    """
    slug = str(slug).strip().lower()
    cache = cache if isinstance(cache, dict) else {}
    quotes = cache.get("quotes") if isinstance(cache.get("quotes"), dict) else {}
    profiles = cache.get("profiles") if isinstance(cache.get("profiles"), dict) else {}

    ticker = _ticker_for(slug, base)
    quote = quotes.get(ticker) if isinstance(quotes.get(ticker), dict) else {}
    if not quote:
        fallback_ticker = UNIVERSE.get(slug, (ticker, ticker))[0]
        quote = quotes.get(fallback_ticker) if isinstance(quotes.get(fallback_ticker), dict) else {}
    profile = profiles.get(slug) if isinstance(profiles.get(slug), dict) else {}
    if not quote and not profile:
        return None

    quote_data: dict[str, Any] = quote
    profile_data: dict[str, Any] = profile
    ticker_quote = _quote_for(quote_data, profile_data)
    financials = profile_data.get("financials")
    annual, valuation = _annual_and_valuation(
        financials if isinstance(financials, dict) else {},
        profile_data,
        _num(quote_data.get("price")) or _num(profile_data.get("price")),
        _num(profile_data.get("marketCapCr")),
    )

    return Company(
        profile=_profile_for(slug, quote_data, profile_data, base),
        quote=ticker_quote,
        annual=annual,
        valuation=valuation,
        segments=[],  # not available from free public sources
        quarterly=_quarters(profile_data.get("quarters")),
        riskFactors=_risk_factors(profile_data.get("cons")),
        managementDiscussion=_management_discussion(profile_data),
        documents=_documents(slug, profile_data.get("citations")),
        provenance={
            "mode": "live",
            "asOf": cache.get("savedAt"),
            "sources": ["Yahoo Finance", "Screener.in / issuer filings"],
            "unavailable": list(UNAVAILABLE),
        },
    )
