"""Tests for the AI research module registry (backend/app/ai/modules)."""

import pytest

from app.ai.base import AIContext, AIRequest
from app.ai.llm import get_llm
from app.ai.modules import MODULES, resolve
from app.core.config import get_settings
from app.data import OfflineDataStore

EXPECTED_KEYS = [
    "analyst",
    "compare",
    "competitive",
    "ratio",
    "risk",
    "score",
    "summarize-annual",
    "summarize-earnings",
    "summarize-quarterly",
    "valuation",
]


@pytest.fixture
def llm_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "llm_enabled", False)


@pytest.fixture
def ctx() -> AIContext:
    return AIContext(store=OfflineDataStore(), llm=get_llm())


async def test_module_keys() -> None:
    assert sorted(MODULES) == EXPECTED_KEYS


async def test_resolve_prefers_companies() -> None:
    assert await resolve(AIRequest(question="q", company="a", companies=["b", "c"])) == "b"
    assert await resolve(AIRequest(question="q", company="a")) == "a"
    assert await resolve(AIRequest(question="q")) == ""


async def test_score_module_returns_rating(ctx: AIContext, llm_off) -> None:
    """Scorecard carries the word score, a rating label and the pillars table."""
    reply = await MODULES["score"](ctx, AIRequest(company="reliance", question="score this"))
    assert "score" in reply.answer.lower()
    assert any(r in reply.answer for r in ("Strong Buy", "Buy", "Hold", "Sell"))
    assert "Pillar (weight)" in reply.answer


async def test_fallback_mode_when_llm_disabled(ctx: AIContext, llm_off: None) -> None:
    reply = await MODULES["analyst"](
        ctx, AIRequest(company="reliance", question="review the fundamentals")
    )
    assert reply.mode == "fallback"
    assert reply.answer.strip()


async def test_all_modules_fallback_nicely(ctx: AIContext, llm_off: None) -> None:
    cases = [
        ("analyst", AIRequest(question="performance", company="reliance")),
        ("summarize-annual", AIRequest(question="annual report", company="reliance")),
        ("summarize-quarterly", AIRequest(question="quarterly report", company="reliance")),
        ("summarize-earnings", AIRequest(question="earnings call", company="reliance")),
        ("risk", AIRequest(question="risk profile", company="reliance")),
        ("valuation", AIRequest(question="valuation check", company="reliance")),
        ("ratio", AIRequest(question="net margin trend", company="reliance")),
        ("compare", AIRequest(question="compare", companies=["reliance", "tcs"])),
        ("score", AIRequest(question="score this", company="reliance")),
        ("competitive", AIRequest(question="moat analysis", company="reliance")),
    ]
    for key, req in cases:
        reply = await MODULES[key](ctx, req)
        assert reply.mode == "fallback", key
        assert reply.answer.strip(), key


async def test_score_is_deterministic(ctx: AIContext, llm_off: None) -> None:
    req = AIRequest(company="reliance", question="score this")
    first = await MODULES["score"](ctx, req)
    second = await MODULES["score"](ctx, req)
    assert first.answer == second.answer