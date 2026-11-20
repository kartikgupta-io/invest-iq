"""AI & comparison endpoint tests.

The LLM is disabled before any request so answers are deterministic fallbacks.
The app is built from the real fixtures (reliance, tcs, infosys ...).
"""

from fastapi.testclient import TestClient

from app.ai.llm import get_llm
from app.main import create_app


def _client() -> TestClient:
    get_llm().settings.llm_enabled = False
    return TestClient(create_app())


def test_ask_non_stream_fallback() -> None:
    client = _client()
    resp = client.post(
        "/api/v1/ai/ask",
        json={"question": "reliance revenue growth", "module": "analyst", "session_id": "non-stream-1"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body.get("answer"), str)
    assert body["answer"].strip()
    assert body.get("mode") == "fallback"


def test_ask_stream_sse() -> None:
    client = _client()
    resp = client.post(
        "/api/v1/ai/ask",
        json={
            "question": "tcs net margin",
            "module": "analyst",
            "session_id": "stream-1",
            "stream": True,
        },
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")
    assert "[DONE]" in resp.text
    assert '"citations"' in resp.text
    assert '"mode": "fallback"' in resp.text


def test_compare_returns_tables_and_resolves_ticker() -> None:
    client = _client()
    resp = client.get("/api/v1/ai/compare", params={"symbols": "reliance,tcs,infy"})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["symbols"]) == 3
    assert "infosys" in body["symbols"]
    assert "valuation" in body["tables"]
    valuation = body["tables"]["valuation"]
    assert valuation and {"metric", "values"} <= set(valuation[0])
    assert set(valuation[0]["values"]) <= set(body["symbols"])


def test_compare_summary_has_narratives() -> None:
    client = _client()
    resp = client.get("/api/v1/ai/compare/summary", params={"symbols": "reliance,tcs,infy"})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["symbols"]) == 3
    assert body["narratives"]
    assert body["tables"]