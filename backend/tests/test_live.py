"""Offline tests for the live-data subsystem (no network calls)."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.data import live_sources as live
from app.main import create_app


def _yahoo_payload() -> dict:
    return {
        "chart": {
            "result": [{
                "meta": {
                    "symbol": "TCS.NS",
                    "currency": "INR",
                    "regularMarketPrice": 2376.2,
                    "regularMarketChangePercent": 0.54,
                    "chartPreviousClose": 2358.5,
                    "regularMarketDayHigh": 2389.0,
                    "regularMarketDayLow": 2350.0,
                    "regularMarketVolume": 2_100_000,
                    "fiftyTwoWeekHigh": 2500.0,
                    "fiftyTwoWeekLow": 1800.0,
                    "regularMarketTime": 1700000000,
                    "longName": "Tata Consultancy Services Limited",
                },
                "indicators": {"quote": [{"close": [2300.0, 2358.5, 2376.2]}]},
            }],
            "error": None,
        }
    }


SAMPLE_HTML = """<!doctype html>
<html><head>
<title>Acme Corp share price - Screener</title>
<meta name="description" content="Acme Corp · Mkt Cap: 1,000 Cr · Revenue: 500 Cr">
</head><body>
<div class="company-info">
  <h1>Acme Corp Ltd</h1>
  <div class="company-profile">
    <div class="sub show-more-box about"><p>Acme Corp manufactures widgets and exports them worldwide.</p></div>
    <div class="sub commentary always-show-more-box">
      <p><strong>Capacity</strong> Acme expanded its Pune plant and raised export guidance.
        <sup><a href="https://acme.example/filings/annual.pdf#page=12">[1]</a></sup></p>
    </div>
  </div>
</div>
<ul id="top-ratios">
  <li><span class="name">Market Cap</span><span class="nowrap value">&#8377; <span class="number">18,71,726</span> Cr.</span></li>
  <li><span class="name">Current Price</span><span class="value">&#8377; <span class="number">1,378</span></span></li>
  <li><span class="name">High / Low</span><span class="value">&#8377; <span class="number">1,612</span> / <span class="number">1,152</span></span></li>
  <li><span class="name">Stock P/E</span><span class="value"><span class="number">22.8</span></span></li>
  <li><span class="name">Book Value</span><span class="value">&#8377; <span class="number">698</span></span></li>
  <li><span class="name">Dividend Yield</span><span class="value"><span class="number">0.44</span> %</span></li>
  <li><span class="name">ROCE</span><span class="value"><span class="number">18.5</span> %</span></li>
  <li><span class="name">ROE</span><span class="value"><span class="number">15.2</span> %</span></li>
</ul>
<section id="analysis">
  <div class="pros"><ul><li>Strong export order book</li></ul></div>
  <div class="cons"><ul><li>Rising input costs</li></ul></div>
</section>
</body></html>"""


def test_parse_quote_reads_yahoo_meta() -> None:
    quote = live.parse_quote(_yahoo_payload())
    assert quote["name"] == "Tata Consultancy Services Limited"
    assert quote["price"] == 2376.2
    assert quote["changePct"] == 0.54
    assert quote["previousClose"] == 2358.5
    assert quote["dayHigh"] == 2389.0
    assert quote["dayLow"] == 2350.0
    assert quote["volume"] == 2_100_000
    assert quote["fiftyTwoWeekHigh"] == 2500.0
    assert quote["fiftyTwoWeekLow"] == 1800.0
    assert quote["currency"] == "INR"
    assert quote["asOf"].startswith("2023-11-14")


def test_previous_close_never_uses_range_start_value() -> None:
    payload = _yahoo_payload()
    payload["chart"]["result"][0]["meta"]["chartPreviousClose"] = 1.0  # range start, not yesterday
    quote = live.parse_quote(payload)
    assert quote["previousClose"] == 2358.5  # penultimate daily close, not 1.0


def test_previous_close_falls_back_to_price_and_change() -> None:
    payload = _yahoo_payload()
    del payload["chart"]["result"][0]["indicators"]
    quote = live.parse_quote(payload)
    assert quote["previousClose"] == round(2376.2 / 1.0054, 2)


def test_parse_quote_nulls_missing_fields_and_rejects_bad_payload() -> None:
    quote = live.parse_quote({"chart": {"result": [{"meta": {}}]}})
    assert quote["price"] is None
    assert quote["volume"] is None
    assert quote["asOf"] is None

    try:
        live.parse_quote({"chart": {"result": []}})
    except live.LiveDataError:
        pass
    else:
        raise AssertionError("expected LiveDataError for a payload with no result")


def test_parse_profile_reads_ratios_about_citations_and_analysis() -> None:
    profile = live.parse_profile(SAMPLE_HTML, "acme")
    assert profile["slug"] == "acme"
    assert profile["name"] == "Acme Corp Ltd"
    assert "manufactures widgets" in profile["about"]
    assert profile["marketCapCr"] == 1_871_726.0  # Indian digit grouping
    assert profile["price"] == 1378.0
    assert profile["peRatio"] == 22.8
    assert profile["bookValue"] == 698.0
    assert profile["dividendYield"] == 0.44
    assert profile["roce"] == 18.5
    assert profile["roe"] == 15.2
    assert profile["pros"] == ["Strong export order book"]
    assert profile["cons"] == ["Rising input costs"]

    high_low = next(r for r in profile["topRatios"] if r["name"] == "High / Low")
    assert high_low["values"] == [1612.0, 1152.0]

    assert len(profile["citations"]) == 1
    assert profile["citations"][0]["url"] == "https://acme.example/filings/annual.pdf#page=12"
    assert "[1]" not in profile["keyPoints"][0]["text"]
    assert "export guidance" in profile["keyPoints"][0]["text"]


def test_build_evidence_chunks_and_keeps_real_citation_urls() -> None:
    profile = live.parse_profile(SAMPLE_HTML, "acme")
    evidence = live.build_evidence({"acme": profile})
    assert evidence
    assert all({"id", "company", "title", "snippet", "url", "source"} <= set(item) for item in evidence)
    assert all(len(item["snippet"]) <= 600 for item in evidence)
    assert any(item["url"].endswith("annual.pdf#page=12") for item in evidence)
    assert any(item["source"] == live.COMPANY_SOURCE for item in evidence)
    assert any("Key ratios" in item["title"] for item in evidence)


def test_search_evidence_is_deterministic_and_normalized() -> None:
    profile = live.parse_profile(SAMPLE_HTML, "acme")
    evidence = live.build_evidence({"acme": profile})
    first = live.search_evidence(evidence, "export order book", limit=5)
    second = live.search_evidence(evidence, "export order book", limit=5)
    assert first == second
    assert first == sorted(first, key=lambda hit: -hit["score"])
    assert all(0.0 <= hit["score"] <= 1.0 for hit in first)
    assert any("export" in hit["snippet"].lower() for hit in first)


def test_live_status_endpoint_uses_cache_only(monkeypatch) -> None:
    profile = live.parse_profile(SAMPLE_HTML, "acme")
    seeded = {
        "savedAt": "2026-11-20T10:00:00+00:00",
        "quotes": {"ACME": live.parse_quote(_yahoo_payload())},
        "profiles": {"acme": profile},
    }
    monkeypatch.setattr(live, "get_cached", lambda: seeded)

    client = TestClient(create_app())
    response = client.get("/api/v1/live/status")
    assert response.status_code == 200
    body = response.json()
    assert body["cached"] is True
    assert body["savedAt"] == seeded["savedAt"]
    assert body["companies"] == 1
    assert body["evidenceCount"] > 0
    assert body["sources"] == live.SOURCES


def test_quote_endpoint_falls_back_to_cached_value_on_failure(monkeypatch) -> None:
    cached_quote = live.parse_quote(_yahoo_payload())
    seeded = {"savedAt": "2000-01-01T00:00:00+00:00", "quotes": {"TCS": cached_quote}, "profiles": {}}
    monkeypatch.setattr(live, "get_cached", lambda: seeded)
    monkeypatch.setattr(live, "save_cached", lambda cache: cache)

    async def failing_fetch(ticker: str) -> dict:
        raise live.LiveDataError("network down")

    monkeypatch.setattr(live, "fetch_quote", failing_fetch)

    client = TestClient(create_app())
    response = client.get("/api/v1/live/quote/TCS")
    assert response.status_code == 200
    body = response.json()
    assert body["price"] == 2376.2
    assert body["ticker"] == "TCS"
    assert body["stale"] is True
    assert "network down" in body["error"]


# Fixture values below are arbitrary test data (not claims about any company).
FINANCIALS_HTML = """<!doctype html>
<html><body>
<section id="profit-loss">
  <table class="data-table">
    <thead><tr><th></th>
      <th data-date-key="2025-03-31"> Mar 2025 </th>
      <th data-date-key="2026-03-31"> Mar 2026 </th>
    </tr></thead>
    <tbody>
      <tr><td class="text">Revenue</td><td>1,00,000</td><td>2,00,000</td></tr>
      <tr><td class="text">Net&nbsp;Profit +</td><td>10,000</td><td>(5,000)</td></tr>
    </tbody>
  </table>
</section>
<section id="ratios">
  <table class="data-table">
    <thead><tr><th></th>
      <th data-date-key="2025-03-31"> Mar 2025 </th>
      <th data-date-key="2026-03-31"> Mar 2026 </th>
    </tr></thead>
    <tbody><tr><td class="text">ROE %</td><td>11</td><td>12.5</td></tr></tbody>
  </table>
</section>
<section id="cash-flow">
  <table class="data-table">
    <thead><tr><th></th>
      <th data-date-key="2025-03-31"> Mar 2025 </th>
      <th data-date-key="2026-03-31"> Mar 2026 </th>
    </tr></thead>
    <tbody><tr><td class="text">Free Cash Flow</td><td>2,000</td><td>3,000</td></tr></tbody>
  </table>
</section>
</body></html>"""

QUARTERS_SECTION = """<section id="quarters">
  <table class="data-table">
    <thead><tr><th></th><th> Q1 FY2026 </th><th> Q2 FY2026 </th></tr></thead>
    <tbody>
      <tr><td class="text">Revenue</td><td>50,000</td><td>55,000</td></tr>
      <tr><td class="text">Net Profit</td><td>5,000</td><td>6,000</td></tr>
    </tbody>
  </table>
</section>"""


def test_parse_financials_merges_annual_tables_and_maps_fiscal_years() -> None:
    financials = live.parse_financials(FINANCIALS_HTML, "acme")
    assert set(financials) == {"FY2025", "FY2026"}
    assert financials["FY2025"]["Revenue"] == 100000.0  # Indian digit grouping
    assert financials["FY2026"]["Revenue"] == 200000.0
    assert financials["FY2025"]["Net Profit"] == 10000.0  # &nbsp; + trailing '+'
    assert financials["FY2026"]["Net Profit"] == -5000.0  # (5,000) -> negative
    assert financials["FY2025"]["ROE %"] == 11.0
    assert financials["FY2026"]["ROE %"] == 12.5
    assert financials["FY2026"]["Free Cash Flow"] == 3000.0
    assert set(financials["FY2026"]) == {"Revenue", "Net Profit", "ROE %", "Free Cash Flow"}


def test_parse_financials_rejects_empty_or_table_free_markup() -> None:
    for markup in ("", "   ", "<html><body><p>no tables</p></body></html>"):
        try:
            live.parse_financials(markup, "acme")
        except live.LiveDataError:
            continue
        raise AssertionError("expected LiveDataError for markup without tables")


def test_parse_profile_exposes_financials_and_quarters() -> None:
    empty = live.parse_profile(SAMPLE_HTML, "acme")
    assert empty["financials"] == {}
    assert empty["quarters"] == {}

    combined = FINANCIALS_HTML.replace("</body>", QUARTERS_SECTION + "</body>")
    profile = live.parse_profile(combined, "acme")
    assert profile["financials"]["FY2026"]["Revenue"] == 200000.0
    assert profile["quarters"]["Q1 FY2026"]["Revenue"] == 50000.0
    assert profile["quarters"]["Q2 FY2026"]["Net Profit"] == 6000.0
    json.dumps(profile)  # both additions must be JSON-serializable


def test_parse_index_keeps_caret_symbol_without_ns_suffix() -> None:
    payload = {"chart": {"result": [{"meta": {
        "symbol": "^NSEI",
        "regularMarketPrice": 25800.6,
        "regularMarketChangePercent": 1.122,
        "regularMarketTime": 1700000000,
        "longName": "NIFTY 50",
    }}]}}
    index = live.parse_index(payload, "^NSEI", "NIFTY 50")
    assert index["name"] == "NIFTY 50"
    assert index["symbol"] == "^NSEI"
    assert ".NS" not in index["symbol"]
    assert index["value"] == 25800.6
    assert index["changePct"] == 1.122
    assert index["asOf"].startswith("2023-11-14")

    sparse = live.parse_index({"chart": {"result": [{"meta": {}}]}}, "^BSESN", "SENSEX")
    assert sparse["value"] is None
    assert sparse["changePct"] is None
    assert sparse["asOf"] is None


def test_get_cached_reads_and_persists_indices(monkeypatch, tmp_path) -> None:
    cache_file = tmp_path / "live_cache.json"
    saved = {
        "savedAt": "2026-11-20T10:00:00+00:00",
        "quotes": {},
        "profiles": {},
        "indices": {"^NSEI": {
            "name": "NIFTY 50", "symbol": "^NSEI", "value": 25800.6,
            "changePct": 1.122, "asOf": "2026-11-20T09:00:00+00:00",
        }},
    }
    cache_file.write_text(json.dumps(saved), encoding="utf-8")
    monkeypatch.setattr(live, "CACHE_PATH", cache_file)
    assert live.get_cached()["indices"]["^NSEI"]["value"] == 25800.6

    written = live.save_cached({"indices": {"^BSESN": {
        "name": "SENSEX", "symbol": "^BSESN", "value": 83919.71,
        "changePct": 1.082, "asOf": "2026-11-20T09:00:00+00:00",
    }}})
    assert written["indices"]["^BSESN"]["value"] == 83919.71
    assert live.get_cached()["indices"]["^BSESN"]["name"] == "SENSEX"

    # Cache files written before indices existed remain readable.
    cache_file.write_text(json.dumps({"savedAt": "x", "quotes": {}, "profiles": {}}), encoding="utf-8")
    assert live.get_cached()["indices"] == {}
    assert live._empty_cache()["indices"] == {}


def test_refresh_endpoint_harvests_and_swaps_store(monkeypatch) -> None:
    from datetime import datetime, timezone

    fresh_cache = {
        "savedAt": datetime.now(timezone.utc).isoformat(),
        "quotes": {"TCS": {"price": 1.0}},
        "profiles": {"tcs": {"name": "TCS"}},
        "indices": {},
    }

    async def fake_refresh():
        return fresh_cache

    monkeypatch.setattr(live, "refresh", fake_refresh)

    sentinel_store = object()
    monkeypatch.setattr("app.api.v1.freshness.build_store", lambda: sentinel_store)

    app = create_app()
    old_store = app.state.store
    response = TestClient(app).post("/api/v1/freshness/refresh")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "fresh"
    assert body["quotes"] == 1
    assert body["profiles"] == 1
    assert body["asOf"] == fresh_cache["savedAt"]
    # The whole point of the endpoint: the next request uses the new snapshot.
    assert app.state.store is sentinel_store
    assert app.state.store is not old_store
