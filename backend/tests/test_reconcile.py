"""Offline reconciliation tests — no network calls, no invented financial claims.

Every value below is a hand-written stand-in for the live cache shape. The
assertions only check pass-through, derivation from those inputs, and that
unsourceable fields remain ``None``.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.api.v1 import freshness as freshness_module
from app.core.config import Settings
from app.data import OfflineDataStore
from app.data.contract import (
    AnnualFinancials,
    Company,
    CompanyProfile,
    TickerQuote,
)
from app.data.reconcile import build_company
from app.main import create_app

LEGACY_FAKE_PRICE = 326.46
REAL_CITATION_URL = "https://www.ril.com/reports/RIL-Integrated-Annual-Report-2025-26.pdf#page=169"


def _base_company(slug: str = "reliance", ticker: str = "RELIANCE") -> Company:
    """A legacy-style fixture carrying the synthetic price we must not serve."""
    return Company(
        profile=CompanyProfile(
            slug=slug,
            ticker=ticker,
            name="Legacy Reference Name",
            sector="Energy",
            industry="Oil & Gas",
            exchange="NSE",
            currency="₹",
            currencyCode="INR",
            founded=1966,
            listed="1977",
            headquarters="Mumbai, Maharashtra",
            website="example.invalid",
            description="Legacy description that must be replaced by real about text.",
            employees=1,
            accent="#123456",
            market="INDIA",
        ),
        quote=TickerQuote(
            price=LEGACY_FAKE_PRICE,
            change=0.0,
            changePct=0.0,
            open=LEGACY_FAKE_PRICE,
            high=LEGACY_FAKE_PRICE,
            low=LEGACY_FAKE_PRICE,
            volume=0,
            previousClose=LEGACY_FAKE_PRICE,
            marketCap=1.0,
            peRatio=1.0,
            eps=1.0,
            dividendYield=1.0,
            high52Week=LEGACY_FAKE_PRICE,
            low52Week=LEGACY_FAKE_PRICE,
        ),
        annual=[AnnualFinancials(year="FY2025", roe=12.0, revenueGrowth=8.0)],
        valuation=[],
        segments=[],
        quarterly={},
        riskFactors=[],
        managementDiscussion="",
        documents=[],
    )


def _cache() -> dict:
    return {
        "savedAt": datetime.now(timezone.utc).isoformat(),
        "quotes": {
            "RELIANCE": {
                "name": "Reliance Industries Limited",
                "price": 1377.5,
                "changePct": 0.138,
                "previousClose": 1202.0,
                "dayHigh": 1383.0,
                "dayLow": 1356.1,
                "volume": 13_166_219,
                "fiftyTwoWeekHigh": 1611.8,
                "fiftyTwoWeekLow": 1152.2,
                "currency": "INR",
                "asOf": "2026-11-20T09:58:10+00:00",
            }
        },
        "profiles": {
            "reliance": {
                "slug": "reliance",
                "name": "Reliance Industries",
                "about": "Reliance was founded by Dhirubhai Ambani and is promoted by his family.",
                "summary": "Real Screener summary text.",
                "marketCapCr": 1_871_726.0,
                "price": 1378.0,
                "peRatio": 22.8,
                "bookValue": 698.0,
                "dividendYield": 0.44,
                "cons": ["Company has a low return on equity over last 3 years."],
                "keyPoints": [{"text": "A real key point from the filing.", "urls": [REAL_CITATION_URL]}],
                "citations": [{"title": "Integrated Annual Report", "url": REAL_CITATION_URL}],
                "financials": {
                    "FY2024": {
                        "Revenue": 1_000_000.0,
                        "Net Profit": 80_000.0,
                        "EPS in Rs": 60.0,
                        "ROE %": 9.5,
                        "Equity Capital": 1_000.0,
                        "Reserves": 400_000.0,
                    },
                    "FY2025": {
                        "Revenue": 1_100_000.0,
                        "Net Profit": 95_625.0,
                        "EPS in Rs": 70.5,
                        "ROE %": 8.91,
                        "Equity Capital": 1_100.0,
                        "Reserves": 450_000.0,
                        "Borrowing": 12_000.0,
                        "Cash from Operating Activity": 150_000.0,
                    },
                },
                "quarters": {
                    "FY2025": [
                        {
                            "quarter": "Q1",
                            "endDate": "2025-06-30",
                            "revenue": 250_000.0,
                            "netIncome": 20_000.0,
                        }
                    ]
                },
            }
        },
        "indices": {
            "^NSEI": {"name": "NIFTY 50", "value": 25_800.6, "changePct": 1.122, "asOf": "2026-11-20T09:58:10+00:00"}
        },
    }


def test_legacy_fake_price_is_not_served() -> None:
    company = build_company("reliance", _cache(), _base_company())
    assert company is not None
    assert company.quote.price == 1377.5
    assert company.quote.price != LEGACY_FAKE_PRICE
    assert str(LEGACY_FAKE_PRICE) not in json.dumps(company.model_dump())


def test_quote_fields_come_from_live_cache() -> None:
    company = build_company("reliance", _cache(), _base_company())
    assert company is not None
    quote = company.quote
    assert quote.changePct == 0.138
    assert quote.previousClose == 1202.0
    assert quote.change == quote.price - quote.previousClose
    assert quote.high == 1383.0
    assert quote.low == 1356.1
    assert quote.volume == 13_166_219
    assert quote.high52Week == 1611.8
    assert quote.low52Week == 1152.2
    assert quote.open is None and quote.eps is None


def test_market_cap_comes_from_profile_market_cap_cr() -> None:
    company = build_company("reliance", _cache(), _base_company())
    assert company is not None
    assert company.quote.marketCap == 1_871_726.0  # already Rs crore
    assert company.quote.peRatio == 22.8
    assert company.quote.dividendYield == 0.44


def test_profile_metadata_and_real_about_text() -> None:
    cache = _cache()
    company = build_company("reliance", cache, _base_company())
    assert company is not None
    assert company.profile.sector == "Energy"  # reference metadata from base
    assert company.profile.description == cache["profiles"]["reliance"]["about"]


def test_annual_maps_real_rows_and_preserves_nulls() -> None:
    cache = _cache()
    company = build_company("reliance", cache, _base_company())
    assert company is not None
    assert [row.year for row in company.annual] == ["FY2024", "FY2025"]
    first, latest = company.annual

    assert latest.netIncome == 95_625.0
    assert latest.eps == 70.5
    assert latest.totalEquity == 1_100.0 + 450_000.0
    assert latest.totalDebt == 12_000.0
    assert latest.operatingCashFlow == 150_000.0
    assert latest.revenueGrowth == pytest.approx(
        (1_100_000.0 - 1_000_000.0) / 1_000_000.0 * 100
    )
    assert latest.netMargin == pytest.approx(95_625.0 / 1_100_000.0 * 100)
    assert first.revenueGrowth is None  # no prior real revenue to derive from
    assert latest.bookValue == 698.0
    assert latest.peRatio == 22.8
    assert latest.dividendYield == 0.44
    assert latest.priceToBook == pytest.approx(1377.5 / 698.0)
    assert first.bookValue is None and first.peRatio is None
    assert first.priceToBook is None and first.dividendYield is None

    # Values the source actually reports are surfaced; missing concepts stay null.
    assert latest.grossProfit is None
    assert latest.ebitda is None
    assert latest.netDebt is None
    assert latest.debtToEquity == pytest.approx(12_000.0 / (1_100.0 + 450_000.0))
    assert latest.roce is None
    assert latest.interestCover is None
    assert latest.cash is None
    # Every sourced row is preserved, including ones without a typed field.
    assert latest.metrics["Reserves"] == 450_000.0
    assert first.metrics["ROE %"] == 9.5


def test_missing_eps_with_payout_stays_null_instead_of_crashing() -> None:
    """A real filing can report a payout without EPS — never invent the DPS."""
    cache = _cache()
    del cache["profiles"]["reliance"]["financials"]["FY2025"]["EPS in Rs"]
    cache["profiles"]["reliance"]["financials"]["FY2025"]["Dividend Payout %"] = 30.0
    company = build_company("reliance", cache, _base_company())
    assert company is not None
    assert company.annual[-1].eps is None
    assert company.annual[-1].dividendPerShare is None


def test_segments_empty_and_valuation_has_only_latest_point() -> None:
    company = build_company("reliance", _cache(), _base_company())
    assert company is not None
    assert company.segments == []
    assert len(company.valuation) == 1
    point = company.valuation[0]
    assert point.year == "FY2025"
    assert point.price == 1377.5
    assert point.marketCap == 1_871_726.0
    assert point.peRatio == 22.8
    assert point.evToEbitda is None
    assert company.quarterly["FY2025"][0].revenue == 250_000.0
    assert company.quarterly["FY2025"][0].ebitda is None


def test_quarters_accepts_screener_table_shape() -> None:
    cache = _cache()
    cache["profiles"]["reliance"]["quarters"] = {
        "Q1 FY2026": {"Revenue": 250_000.0, "Net Profit": 20_000.0, "EPS in Rs": 12.5}
    }
    company = build_company("reliance", cache, _base_company())
    assert company is not None
    quarter = company.quarterly["FY2026"][0]
    assert quarter.quarter == "Q1"
    assert quarter.revenue == 250_000.0
    assert quarter.netIncome == 20_000.0
    assert quarter.eps == 12.5
    assert quarter.endDate == ""
    assert quarter.ebitda is None


def test_documents_use_real_citations_without_invented_metadata() -> None:
    company = build_company("reliance", _cache(), _base_company())
    assert company is not None
    assert len(company.documents) == 1
    doc = company.documents[0]
    assert doc.id == "reliance-citation-1"
    assert doc.sourceUrl == REAL_CITATION_URL
    assert doc.title == "Integrated Annual Report"
    assert doc.source == "Investor Relations"
    assert doc.sha256 is None
    assert doc.sizeKb is None
    assert doc.pages is None
    assert doc.filedDate is None
    assert doc.periodEnd is None
    assert doc.versions == []


def test_provenance_and_unknown_slug() -> None:
    cache = _cache()
    company = build_company("reliance", cache, _base_company())
    assert company is not None
    assert company.provenance is not None
    assert company.provenance["mode"] == "live"
    assert company.provenance["asOf"] == cache["savedAt"]
    assert company.provenance["sources"] == ["Yahoo Finance", "Screener.in / issuer filings"]
    assert "segments" in company.provenance["unavailable"]  # type: ignore[operator]
    assert build_company("unknown-company", _cache(), None) is None


def test_offline_store_reconciles_live_and_marks_legacy(tmp_path) -> None:
    companies_dir = tmp_path / "companies"
    companies_dir.mkdir()
    (companies_dir / "reliance.json").write_text(
        json.dumps(_base_company().model_dump()), encoding="utf-8"
    )
    (companies_dir / "tata-motors.json").write_text(
        json.dumps(_base_company("tata-motors", "TATAMOTORS").model_dump()), encoding="utf-8"
    )
    store = OfflineDataStore(
        Settings(fixtures_dir=str(tmp_path), api_prefix="/api/v1"),
        embed=lambda _: None,
        live_cache=_cache(),
    )
    live = asyncio.run(store.get_company("reliance"))
    legacy = asyncio.run(store.get_company("tata-motors"))
    assert live is not None and live.provenance is not None
    assert live.provenance["mode"] == "live"
    assert live.quote.price == 1377.5
    assert legacy is not None and legacy.provenance == {"mode": "legacy"}
    assert legacy.quote.price == LEGACY_FAKE_PRICE
    indices = asyncio.run(store.get_market_indices())
    assert any(index.ticker == "^NSEI" and index.value == 25_800.6 for index in indices)


def test_summary_handles_null_roe(tmp_path) -> None:
    store = OfflineDataStore(
        Settings(fixtures_dir=str(tmp_path), api_prefix="/api/v1"),
        embed=lambda _: None,
        live_cache={},
    )
    company = _base_company()
    company.annual = [AnnualFinancials(year="FY2025", roe=None, revenueGrowth=None)]
    summary = store._summary(company)
    assert summary.roe is None
    assert summary.revenueGrowth is None


def test_freshness_endpoint_reports_live_saved_at(monkeypatch: pytest.MonkeyPatch) -> None:
    seeded = {
        "savedAt": datetime.now(timezone.utc).isoformat(),
        "quotes": {},
        "profiles": {},
    }
    monkeypatch.setattr(freshness_module, "get_cached", lambda: seeded)
    client = TestClient(create_app())
    response = client.get("/api/v1/freshness")
    assert response.status_code == 200
    body = response.json()
    assert body["asOf"] == seeded["savedAt"]
    assert body["status"] == "fresh"
    assert body["staleAfterSeconds"] == 1_800
    assert body["source"] == "Yahoo Finance + Screener.in"
    assert isinstance(body["ageSeconds"], int)
