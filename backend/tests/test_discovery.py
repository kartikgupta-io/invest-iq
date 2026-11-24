"""Offline tests for best-effort external company discovery."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.data import live_sources as live
from app.data.offline import OfflineDataStore
from app.main import create_app


def _search_payload() -> dict:
    return {
        "quotes": [
            {"symbol": "HDB", "longname": "HDFC Bank ADR", "exchange": "NYQ", "quoteType": "EQUITY", "score": 99},
            {"symbol": "HDFCBANK.NS", "longname": "HDFC Bank Limited", "exchange": "NSI", "quoteType": "EQUITY", "score": 50},
            {"symbol": "HDFCGOLD.NS", "longname": "HDFC Gold ETF", "exchange": "NSI", "quoteType": "ETF", "score": 80},
        ]
    }


def test_parse_search_results_prefers_indian_equities() -> None:
    parsed = live.parse_search_results(_search_payload())
    assert [item["ticker"] for item in parsed] == ["HDFCBANK.NS", "HDB"]
    assert parsed[0]["slug"] == "hdfcbank"
    assert parsed[0]["exchange"] == "NSE"
    # ETFs are excluded entirely.
    assert not any("GOLD" in item["ticker"] for item in parsed)


def test_slug_and_all_quotes_merge_discovered() -> None:
    assert live.slug_from_ticker("HDFCBANK.NS") == "hdfcbank"
    cache = {
        "quotes": {"TCS": {"price": 1.0}},
        "discovered": {"hdfcbank": {"ticker": "HDFCBANK.NS", "quote": {"price": 2.0}}},
    }
    merged = live.all_quotes(cache)
    assert merged["TCS"]["price"] == 1.0
    assert merged["HDFCBANK.NS"]["price"] == 2.0


def test_resolve_company_caches_external_result(monkeypatch) -> None:
    saved: dict = {"savedAt": "x", "quotes": {}, "profiles": {}, "indices": {}}

    async def fake_search(query, limit=8):
        return live.parse_search_results(_search_payload())[:limit]

    async def fake_quote(ticker):
        return {"price": 1640.0, "changePct": 0.8, "currency": "INR", "name": "HDFC Bank Limited"}

    monkeypatch.setattr(live, "get_cached", lambda: saved)
    monkeypatch.setattr(live, "save_cached", lambda cache: saved.update(cache) or cache)
    monkeypatch.setattr(live, "fetch_search", fake_search)
    monkeypatch.setattr(live, "fetch_quote", fake_quote)

    result = __import__("asyncio").run(live.resolve_company("hdfc bank"))
    assert result["resolved"] is True
    assert result["companies"][0]["ticker"] == "HDFCBANK.NS"
    assert result["companies"][0]["quote"]["price"] == 1640.0
    assert any(entry.get("ticker") == "HDFCBANK.NS" for entry in saved["discovered"].values())

    # A second lookup is served from cache without touching the network.
    def fail_search(query, limit=8):
        raise AssertionError("network should not be used on a cache hit")

    monkeypatch.setattr(live, "fetch_search", fail_search)
    cached = __import__("asyncio").run(live.resolve_company("hdfc bank"))
    assert cached["cached"] is True
    assert cached["companies"][0]["ticker"] == "HDFCBANK.NS"


def test_resolve_company_failure_never_invents(monkeypatch) -> None:
    from app.data.live_sources import LiveDataError

    async def fail(query, limit=8):
        raise LiveDataError("offline")

    monkeypatch.setattr(live, "get_cached", lambda: {"discovered": {}})
    monkeypatch.setattr(live, "fetch_search", fail)
    result = __import__("asyncio").run(live.resolve_company("unknown co"))
    assert result["companies"] == []
    assert result["resolved"] is False
    assert "offline" in result["error"]


def test_discover_endpoint_local_first_then_external(monkeypatch, tmp_path) -> None:
    calls = []

    async def fake_resolve(query, limit=8):
        calls.append(query)
        return {
            "companies": [{
                "slug": "hdfcbank",
                "ticker": "HDFCBANK.NS",
                "name": "HDFC Bank Limited",
                "quote": {"price": 1640.0, "changePct": 0.8, "currency": "INR"},
            }],
            "resolved": True,
            "cached": False,
            "query": query,
        }

    monkeypatch.setattr(live, "resolve_company", fake_resolve)
    app = create_app()
    # An empty fixture dir keeps this test deterministic: no built-in coverage.
    app.state.store = OfflineDataStore(settings=str(tmp_path))
    client = TestClient(app)

    # Seed one local company to prove local-first behaviour.
    real = OfflineDataStore()
    app.state.store._companies = {"tcs": __import__("asyncio").run(real.get_company("tcs"))}
    local = client.get("/api/v1/live/discover", params={"q": "TCS"}).json()
    assert local["companies"][0]["ticker"] == "TCS"
    assert calls == []

    # Unknown coverage triggers best-effort external discovery.
    external = client.get("/api/v1/live/discover", params={"q": "HDFC"}).json()
    assert calls == ["HDFC"]
    assert external["companies"][0]["ticker"] == "HDFCBANK.NS"
    assert external["companies"][0]["price"] == 1640.0
