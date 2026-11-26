"""Verification for accurate, self-refreshing market indices."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.data import live_sources as live
from app.main import create_app


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _cache(indices: dict | None = None) -> dict:
    return {"savedAt": _now(), "quotes": {}, "profiles": {}, "indices": indices or {}, "discovered": {}}


def _entry(value: float = 25800.6, fetched_at: str | None = None) -> dict:
    return {
        "name": "NIFTY 50",
        "symbol": "^NSEI",
        "value": value,
        "changePct": 1.1,
        "asOf": fetched_at or _now(),
        "fetchedAt": fetched_at or _now(),
        "source": live.QUOTE_SOURCE,
    }


def test_index_ttl_detects_stale_and_missing_entries() -> None:
    assert live.indices_need_refresh(_cache()) is True
    fresh = {"^NSEI": _entry(), "^BSESN": _entry(), "^NSEBANK": _entry()}
    assert live.indices_need_refresh(_cache(fresh)) is False
    stale_cache = _cache({"^NSEI": _entry(fetched_at="2020-01-01T00:00:00+00:00")})
    stale_cache["indicesFetchedAt"] = "2020-01-01T00:00:00+00:00"
    assert live.indices_need_refresh(stale_cache) is True


def test_index_payloads_keep_provenance_and_never_invent_zero() -> None:
    payloads = live.index_payloads(_cache({
        "^NSEI": _entry(),
        "^BSESN": {**_entry(), "value": None},
    }))
    by_ticker = {item["ticker"]: item for item in payloads}
    assert by_ticker["^NSEI"]["value"] == 25800.6
    assert by_ticker["^NSEI"]["source"] == "Yahoo Finance"
    assert by_ticker["^NSEI"]["stale"] is False
    assert by_ticker["^BSESN"]["value"] is None
    assert by_ticker["^BSESN"]["stale"] is False  # freshly fetched, but unavailable


def test_market_indices_refresh_when_stale(monkeypatch) -> None:
    saved: dict = _cache({
        "^NSEI": _entry(fetched_at="2020-01-01T00:00:00+00:00"),
        "^BSESN": _entry(fetched_at="2020-01-01T00:00:00+00:00"),
        "^NSEBANK": _entry(fetched_at="2020-01-01T00:00:00+00:00"),
    })
    calls = []

    async def fake_fetch():
        calls.append(1)
        return {"^NSEI": _entry(value=25001.25), "^BSESN": _entry(value=82000.0), "^NSEBANK": _entry(value=54000.0)}

    monkeypatch.setattr(live, "get_cached", lambda: saved)
    monkeypatch.setattr(live, "save_cached", lambda cache: saved.update(cache) or cache)
    monkeypatch.setattr(live, "fetch_indices", fake_fetch)

    client = TestClient(create_app())
    response = client.get("/api/v1/market/indices")
    assert response.status_code == 200
    assert calls == [1]
    body = response.json()
    nifty = next(item for item in body if item["ticker"] == "^NSEI")
    assert nifty["value"] == 25001.25
    assert nifty["asOf"] and nifty["fetchedAt"] and nifty["source"]
    assert nifty["stale"] is False

    # A second request inside the TTL is served from cache without re-fetching.
    assert client.get("/api/v1/market/indices").status_code == 200
    assert calls == [1]


def test_parse_index_includes_fetch_provenance() -> None:
    payload = {"chart": {"result": [{"meta": {
        "regularMarketPrice": 25800.6, "regularMarketChangePercent": 1.1, "regularMarketTime": 1700000000
    }}]}}
    parsed = live.parse_index(payload, "^NSEI", "NIFTY 50", fetched_at="2026-11-26T00:00:00+00:00", source="Yahoo Finance")
    assert parsed["fetchedAt"] == "2026-11-26T00:00:00+00:00"
    assert parsed["source"] == "Yahoo Finance"
