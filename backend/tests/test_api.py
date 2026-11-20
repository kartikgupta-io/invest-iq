import json

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.data import OfflineDataStore
from app.data.contract import (
    AnnualFinancials,
    BusinessSegment,
    Company,
    CompanyProfile,
    DocumentChunk,
    FilingVersion,
    FinancialDocument,
    QuarterlyResult,
    RiskPoint,
    SearchResult,
    SegmentBreakdownPoint,
    TickerQuote,
    ValuationPoint,
)
from app.main import create_app


def _company_payload() -> Company:
    profile = CompanyProfile(
        slug="acme",
        ticker="ACME",
        name="Acme Corp",
        sector="Industrials",
        industry="Machinery",
        exchange="NSE",
        currency="INR",
        currencyCode="INR",
        founded=1998,
        listed="1998-04-12",
        headquarters="Mumbai",
        website="https://acme.example.com",
        description="A fake company used for tests.",
        employees=1000,
        accent="#123456",
        market="india",
    )
    quote = TickerQuote(
        price=250.0,
        change=5.0,
        changePct=2.04,
        open=245.0,
        high=255.0,
        low=244.0,
        volume=1_000_000,
        previousClose=245.0,
        marketCap=5_000_000_000.0,
        peRatio=20.0,
        eps=12.5,
        dividendYield=1.0,
        high52Week=270.0,
        low52Week=180.0,
    )
    annual = AnnualFinancials(
        year="FY25",
        revenue=1_000_000_000.0,
        revenueGrowth=12.0,
        grossProfit=400_000_000.0,
        operatingIncome=200_000_000.0,
        ebitda=250_000_000.0,
        netIncome=150_000_000.0,
        eps=12.5,
        netMargin=15.0,
        grossMargin=40.0,
        operatingMargin=20.0,
        ebitdaMargin=25.0,
        returnOnAssets=10.0,
        totalAssets=2_000_000_000.0,
        totalEquity=1_000_000_000.0,
        totalDebt=500_000_000.0,
        netDebt=400_000_000.0,
        cash=100_000_000.0,
        debtToEquity=0.5,
        currentRatio=2.0,
        operatingCashFlow=180_000_000.0,
        investingCashFlow=-60_000_000.0,
        financingCashFlow=-80_000_000.0,
        freeCashFlow=120_000_000.0,
        capex=60_000_000.0,
        roe=15.0,
        roce=14.0,
        interestCover=8.0,
        bookValue=100.0,
        dividendPerShare=2.5,
        dividendYield=1.0,
        sharesOutstanding=40_000_000.0,
        revenuePerShare=25.0,
        priceToSales=5.0,
        evToEbitda=18.0,
        peRatio=20.0,
        priceToBook=2.5,
    )
    doc = FinancialDocument(
        id="doc-1",
        companySlug="acme",
        type="10-K",
        title="Acme Corp FY25 Annual Report",
        form="10-K",
        fiscalPeriod="FY25",
        filedDate="2025-06-30",
        periodEnd="2025-03-31",
        source="SEC EDGAR",
        sourceUrl="https://example.com/doc-1",
        sizeKb=2048,
        pages=120,
        sha256="abc123",
        latestVersion="v1",
        versions=[FilingVersion(version="v1", uploadedAt="2025-07-01T00:00:00Z", note="Original")],
    )
    return Company(
        profile=profile,
        quote=quote,
        annual=[annual],
        valuation=[
            ValuationPoint(
                year="FY25",
                price=250.0,
                marketCap=5_000_000_000.0,
                peRatio=20.0,
                priceToBook=2.5,
                evToEbitda=18.0,
                dividendYield=1.0,
            )
        ],
        segments=[
            SegmentBreakdownPoint(
                year="FY25",
                segments=[BusinessSegment(name="Machinery", revenue=600_000_000.0, share=60.0, growth=10.0)],
            )
        ],
        quarterly={
            "FY25": [
                QuarterlyResult(
                    quarter="Q4",
                    endDate="2025-03-31",
                    revenue=280_000_000.0,
                    netIncome=40_000_000.0,
                    ebitda=65_000_000.0,
                    eps=1.0,
                    margin=14.3,
                )
            ]
        },
        riskFactors=[RiskPoint(title="Competition", description="Intense rivalry", severity="medium")],
        managementDiscussion="Revenue grew steadily during the year.",
        documents=[doc],
    )


@pytest.fixture
def client(tmp_path) -> TestClient:
    companies_dir = tmp_path / "companies"
    companies_dir.mkdir()
    (companies_dir / "acme.json").write_text(json.dumps(_company_payload().model_dump()), encoding="utf-8")

    chunks = [
        DocumentChunk(
            id="chunk-1",
            documentId="doc-1",
            page=1,
            section="Overview",
            text="Acme Corporation annual report highlights steady revenue growth across all segments.",
        )
    ]
    (tmp_path / "chunks.json").write_text(json.dumps([chunk.model_dump() for chunk in chunks]), encoding="utf-8")

    settings = Settings(fixtures_dir=str(tmp_path), api_prefix="/api/v1")
    store = OfflineDataStore(settings)
    app = create_app()
    app.state.store = store
    return TestClient(app)


def test_health(client: TestClient) -> None:
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "service": "investiq-backend"}


def test_freshness(client: TestClient) -> None:
    resp = client.get("/api/v1/freshness")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] in {"fresh", "stale"}
    assert body["asOf"] and body["source"]
    assert body["staleAfterSeconds"] == 1_800  # live cache TTL


def test_list_companies_contains_summary(client: TestClient) -> None:
    resp = client.get("/api/v1/companies")
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body, list)
    assert any(item["slug"] == "acme" and item["ticker"] == "ACME" for item in body)


def test_get_company_profile(client: TestClient) -> None:
    resp = client.get("/api/v1/companies/acme")
    assert resp.status_code == 200
    body = resp.json()
    assert body["profile"]["slug"] == "acme"
    assert body["profile"]["name"] == "Acme Corp"
    assert body["annual"]


def test_company_not_found(client: TestClient) -> None:
    resp = client.get("/api/v1/companies/nope")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Company not found"


def test_semantic_search_returns_hits(client: TestClient) -> None:
    resp = client.post("/api/v1/search", json={"query": "acme annual report"})
    assert resp.status_code == 200
    result = SearchResult.model_validate(resp.json())
    assert isinstance(result.hits, list)
    assert result.hits