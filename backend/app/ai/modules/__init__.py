"""InvestIQ AI research module registry.

Each module exposes ``NAME``, a rich ``SYSTEM`` prompt and
``async def run(ctx, req) -> AIReply``. All modules are RAG-grounded and always
return citations; when the LLM is unavailable (or the question can be answered
purely from data) they fall back to a deterministic, citation-carrying builder.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from app.ai.base import AIReply, AIContext, AIRequest
from app.ai.modules import (
    analyst,
    compare,
    competitive,
    ratios,
    risk,
    score,
    summarizer,
    valuation,
)

ModuleFn = Callable[[AIContext, AIRequest], Awaitable[AIReply]]

MODULES: dict[str, ModuleFn] = {
    "analyst": analyst.run,
    "summarize-annual": summarizer.annual,
    "summarize-quarterly": summarizer.quarterly,
    "summarize-earnings": summarizer.earnings,
    "risk": risk.run,
    "valuation": valuation.run,
    "ratio": ratios.run,
    "compare": compare.run,
    "score": score.run,
    "competitive": competitive.run,
}


async def resolve(req: AIRequest) -> str:
    """Return the first valid company slug from a request (``companies[0]`` or ``company``)."""
    if req.companies:
        return req.companies[0]
    if req.company:
        return req.company
    return ""


__all__ = [
    "MODULES",
    "ModuleFn",
    "resolve",
    "analyst",
    "compare",
    "competitive",
    "risk",
    "score",
    "summarizer",
    "valuation",
    "ratios",
]