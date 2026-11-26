"""Grounded-AI endpoint tests — no network, no real model required."""

from fastapi.testclient import TestClient

from app.api.v1 import ai_local
from app.data import alternate_sources as alt
from app.data import live_sources as live
from app.main import app

client = TestClient(app)


def test_ask_returns_real_evidence_without_inventing_an_answer(monkeypatch):
    """With no model available the endpoint must still show evidence, never a guess."""
    async def no_provider():
        return None

    monkeypatch.setattr(ai_local, "detect_provider", no_provider)
    response = client.post(
        "/api/v1/ai-local/ask",
        json={"question": "Jio retail annual report", "limit": 3},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["available"] is False
    assert body["answer"] is None
    assert body["reason"]
    assert len(body["sources"]) > 0
    for source in body["sources"]:
        assert source["url"].startswith("https://")


def test_ask_reports_unavailable_when_no_evidence_matches(monkeypatch):
    async def no_evidence(*_args):
        return [], None

    monkeypatch.setattr(ai_local, "_real_evidence", no_evidence)
    response = client.post(
        "/api/v1/ai-local/ask",
        json={"question": "zzzz nonexistent query", "limit": 3},
    )
    assert response.status_code == 200
    assert response.json()["available"] is False
    assert response.json()["sources"] == []


def test_ask_scopes_evidence_to_the_searched_security(monkeypatch):
    """Searching a security must yield evidence about that security, not a generic corpus."""
    async def fake_ensure(slug):
        return {
            "savedAt": "2026-11-26T10:00:00+00:00",
            "quotes": {},
            "profiles": {
                slug: {
                    "slug": slug,
                    "name": "Test Industries Limited",
                    "about": "Test Industries Limited manufactures widgets in India and reports annual results.",
                }
            },
        }

    async def no_provider():
        return None

    async def no_news(*_args, **_kwargs):
        return []

    async def no_wiki(*_args):
        return None

    monkeypatch.setattr(live, "ensure_company", fake_ensure)
    monkeypatch.setattr(alt, "fetch_google_news", no_news)
    monkeypatch.setattr(alt, "fetch_wikipedia_summary", no_wiki)
    monkeypatch.setattr(alt, "fetch_nse_announcements", no_news)
    monkeypatch.setattr(ai_local, "detect_provider", no_provider)

    response = client.post(
        "/api/v1/ai-local/ask",
        json={"question": "What does Test Industries do?", "company": "test-industries", "limit": 3},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["company"] == "test-industries"
    assert body["available"] is False
    assert body["sources"]
    assert any(source["company"] == "Test Industries Limited" for source in body["sources"])
    assert all(source["url"].startswith("https://") for source in body["sources"])


def test_status_reports_provider_when_present(monkeypatch):
    async def fake_provider():
        return "LM Studio", "tiny-test-model"

    monkeypatch.setattr(ai_local, "detect_provider", fake_provider)
    body = client.get("/api/v1/ai-local/status").json()
    assert body["available"] is True
    assert body["model"] == "tiny-test-model"
