"""Grounded-AI endpoint tests — no network, no real model required."""

from fastapi.testclient import TestClient

from app.api.v1 import ai_local
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
    monkeypatch.setattr(ai_local, "_real_evidence", lambda *_args: ([], None))
    response = client.post(
        "/api/v1/ai-local/ask",
        json={"question": "zzzz nonexistent query", "limit": 3},
    )
    assert response.status_code == 200
    assert response.json()["available"] is False
    assert response.json()["sources"] == []


def test_status_reports_provider_when_present(monkeypatch):
    async def fake_provider():
        return "LM Studio", "tiny-test-model"

    monkeypatch.setattr(ai_local, "detect_provider", fake_provider)
    body = client.get("/api/v1/ai-local/status").json()
    assert body["available"] is True
    assert body["model"] == "tiny-test-model"
