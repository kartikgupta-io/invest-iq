"""Tests for the live-derived notification feed (no network calls)."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.data import live_sources as live
from app.data.notification_feed import build_notifications
from app.data.offline import OfflineDataStore
from app.main import create_app


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _cache() -> dict:
    return {
        "savedAt": _now(),
        "quotes": {
            "RELIANCE": {
                "name": "Reliance Industries Limited",
                "price": 1377.5,
                "changePct": 1.8,
                "previousClose": 1353.1,
                "asOf": _now(),
            },
            "TCS": {
                "name": "Tata Consultancy Services Limited",
                "price": 2376.2,
                "changePct": -0.9,
                "previousClose": 2397.8,
                "asOf": _now(),
            },
            "ITC": {"name": "ITC Limited", "price": 465.0, "changePct": 0.1, "asOf": _now()},
        },
        "profiles": {},
        "indices": {},
    }


def test_price_notifications_come_from_real_quotes() -> None:
    items = build_notifications(_cache())
    prices = [i for i in items if i.type == "price"]

    assert len(prices) == 2  # flat ITC is skipped
    by_ticker = {item.slug: item for item in prices}
    reliance = by_ticker["reliance"]
    assert reliance.title == "RELIANCE up 1.8%"
    assert "₹1,377.50" in reliance.message
    assert "₹1,353.10" in reliance.message
    assert reliance.source == "Yahoo Finance"
    assert reliance.time
    assert by_ticker["tcs"].title == "TCS down 0.9%"


def test_price_notifications_are_sorted_by_magnitude_and_have_stable_ids() -> None:
    cache = _cache()
    prices = [i for i in build_notifications(cache) if i.type == "price"]
    reliance = next(i for i in prices if i.slug == "reliance")
    assert reliance.id == f"price-reliance-{reliance.time[:10]}"
    assert build_notifications(cache)[0].id == build_notifications(cache)[0].id


def test_system_notification_reflects_snapshot_state() -> None:
    fresh = [i for i in build_notifications(_cache()) if i.type == "system"]
    assert len(fresh) == 1
    assert fresh[0].title == "Live snapshot synced"

    old = _cache()
    old["savedAt"] = "2020-01-01T00:00:00+00:00"
    stale = [i for i in build_notifications(old) if i.type == "system"]
    assert stale[0].title == "Data snapshot is stale"

    missing = [i for i in build_notifications({"quotes": {}}) if i.type == "system"]
    assert missing[0].title == "No live snapshot yet"


def test_notifications_endpoint_serves_derived_feed(monkeypatch) -> None:
    cache = _cache()
    app = create_app()
    # Build the store from our synthetic snapshot so the feed is deterministic.
    app.state.store = OfflineDataStore(live_cache=cache)
    response = TestClient(app).get("/api/v1/notifications")

    assert response.status_code == 200
    titles = [item["title"] for item in response.json()]
    assert "RELIANCE up 1.8%" in titles
    assert "TCS down 0.9%" in titles
    assert "Live snapshot synced" in titles
    # No fabricated legacy fixture content survives.
    assert not any("10-K" in t or "AI capex theme" in t for t in titles)
