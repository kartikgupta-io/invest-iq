"""AI & comparison endpoints.

Every endpoint degrades gracefully: when the LLM is disabled or down the ask
endpoints return deterministic, data-derived answers in ``fallback`` mode and
the comparison endpoints are LLM-free by construction.
"""

from __future__ import annotations

import json
import re
import uuid
from collections.abc import AsyncIterator

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import Field

from app.ai.base import AIContext, AIReply, AIRequest
from app.ai.compare import build_compare, compare_summary, resolve_symbols
from app.ai.llm import get_llm
from app.ai.memory import get_memory
from app.ai.metrics import build_metrics, parse_year
from app.ai.rag import grounded_stream, retrieve
from app.data.contract import Citation, Company

router = APIRouter()


class AIAskRequest(AIRequest):
    module: str = Field(default="analyst")


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False, default=str)}\n\n"


def _sse_done() -> str:
    return "data: [DONE]\n\n"


def _load_module_registry() -> dict:
    """Safe late import of the (possibly still-co-authored) module registry."""
    try:
        from app.ai import modules as ai_modules
    except Exception:
        return {}
    return getattr(ai_modules, "MODULES", None) or {}


def _match_slug(question: str, summaries) -> str:
    lowered = question.lower()
    tokens = set(re.findall(r"[a-z0-9]+", lowered))
    for summary in summaries:
        if summary.slug in tokens:
            return summary.slug
    for summary in summaries:
        if summary.ticker.lower() in tokens:
            return summary.slug
    for summary in summaries:
        if summary.slug in lowered:
            return summary.slug
    return ""


def _num(value: float | None) -> str:
    if value is None or value != value:
        return "n/a"
    if abs(value) >= 1e7:
        return f"{value / 1e7:,.2f} Cr"
    if abs(value) >= 1e5:
        return f"{value / 1e5:,.2f} L"
    return f"{value:,.0f}"


def _company_citations(company: Company) -> list[Citation]:
    return [
        Citation(
            id=doc.id,
            documentId=doc.id,
            title=doc.title,
            source=doc.source,
            page=1,
            snippet=doc.title,
            score=1.0,
        )
        for doc in (company.documents or [])[:3]
    ]


def _metrics_block(m, citations: list[Citation]) -> str:
    latest = m.trend[-1] if m.trend else None
    period = f"FY{parse_year(latest.year)}" if latest else "latest"
    ref = "[1]" if citations else ""
    lines = [
        f"**{m.name} ({m.ticker})** — latest available report period {period} {ref}.",
        f"- Revenue {_num(m.revenue)}; growth {m.revenue_growth:+.1f}% YoY {ref}",
        f"- Net margin {m.net_margin:.1f}%; operating margin {m.operating_margin:.1f}%; "
        f"ROE {m.roe:.1f}%; ROCE {m.roce:.1f}% {ref}",
        f"- Operating cash flow {_num(m.operating_cash_flow)}; free cash flow {_num(m.free_cash_flow)}; "
        f"FCF margin {m.fcf_margin:.1f}% {ref}",
        f"- Debt/equity {m.debt_to_equity:.2f}; current ratio {m.current_ratio:.2f} {ref}",
        f"- Valuation: P/E {m.pe:.1f}; P/B {m.pb:.1f}; EV/EBITDA {m.ev_ebitda:.1f}; "
        f"dividend yield {m.dividend_yield:.2f}% {ref}",
        "",
        "_Offline mode: analysis derived from stored filings and market data; live-model reasoning is disabled._",
    ]
    return "\n".join(lines)


async def _offline_reply(store, question: str) -> AIReply:
    """Deterministic, citation-backed fallback answer that needs no LLM."""
    summaries = await store.list_companies()
    slug = _match_slug(question, summaries)
    if not slug:
        covered = ", ".join(f"`{s.ticker}`" for s in summaries[:8])
        return AIReply(
            answer=(
                "I couldn't map your question to a covered company. Covered tickers: "
                f"{covered}. Try e.g. `reliance revenue growth`, `tcs net margin`, or "
                "`risk analysis for ICICIBANK`."
            ),
            citations=[],
            mode="fallback",
        )
    company = await store.get_company(slug)
    if company is None:
        return AIReply(answer="That company wasn't found in the covered universe.", citations=[], mode="fallback")
    metrics = build_metrics(company)
    citations = _company_citations(company)
    return AIReply(answer=_metrics_block(metrics, citations), citations=citations, mode="fallback")


async def _module_or_fallback(ctx: AIContext, body: AIAskRequest) -> AIReply:
    modules = _load_module_registry()
    fn = modules.get(body.module)
    if fn is not None:
        try:
            reply = await fn(ctx, body)
            if reply is not None and reply.answer and reply.answer.strip():
                return reply
        except Exception:
            pass
    return await _offline_reply(ctx.store, body.question)


def _system_prompt(pairs: list[dict]) -> str:
    parts = [
        "You are InvestIQ, an investment research assistant. Ground every claim in the supplied "
        "sources and cite them by number; say when information is unavailable."
    ]
    if pairs:
        lines = ["CONVERSATION HISTORY:"]
        for message in pairs:
            lines.append(f"{message['role'].upper()}: {message['content']}")
        parts.append("\n".join(lines))
    return "\n\n".join(parts)


async def _history_pairs(ctx: AIContext, session_id: str | None) -> list[dict]:
    if not session_id or ctx.memory is None:
        return []
    memory = ctx.memory
    getter = getattr(memory, "get", None)
    if callable(getter):
        history = await getter(session_id)
        if hasattr(memory, "history_messages"):
            return memory.history_messages(history, max_pairs=6)
        return [{"role": m.role, "content": m.content} for m in history]
    records = memory.history(session_id, limit=6)
    return [{"role": r["role"], "content": r["content"]} for r in records]


async def _memory_append(ctx: AIContext, session_id: str | None, role: str, content: str) -> None:
    if not session_id or ctx.memory is None:
        return
    appender = getattr(ctx.memory, "append", None)
    if callable(appender):
        appender(session_id, role, content)
        return
    adder = getattr(ctx.memory, "add", None)
    if callable(adder):
        await adder(session_id, role, content)


async def _stream_reply(ctx: AIContext, body: AIAskRequest, session_id: str | None) -> AsyncIterator[str]:
    available = bool(ctx.llm is not None and ctx.llm.available())
    deltas: list[str] = []

    if available:
        pairs = await _history_pairs(ctx, session_id)
        system = _system_prompt(pairs)
        fallback_reply = await _module_or_fallback(ctx, body)

        def _fallback(_ctx: AIContext, _citations: list[Citation]) -> AIReply:
            return fallback_reply

        async for delta in grounded_stream(
            ctx, body.question, system, company=body.company, limit=6, fallback=_fallback
        ):
            deltas.append(delta)
            yield _sse({"delta": delta})
        citations = await retrieve(ctx, body.question, body.company)
        mode = "live"
    else:
        reply = await _module_or_fallback(ctx, body)
        deltas.append(reply.answer)
        yield _sse({"delta": reply.answer})
        citations = reply.citations
        mode = "fallback"

    yield _sse({"citations": [c.model_dump() for c in citations], "mode": mode})
    yield _sse_done()

    await _memory_append(ctx, session_id, "user", body.question)
    await _memory_append(ctx, session_id, "assistant", "".join(deltas))


@router.post("/ask")
async def ai_ask(request: Request, body: AIAskRequest):
    """Ask the virtual analyst. Returns ``AIReply`` JSON or an SSE stream."""
    ctx = AIContext(store=request.app.state.store, llm=get_llm(), memory=get_memory())
    session_id = body.session_id or str(uuid.uuid4())
    if body.stream:
        return StreamingResponse(
            _stream_reply(ctx, body, session_id),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    await _memory_append(ctx, session_id, "user", body.question)
    reply = await _module_or_fallback(ctx, body)
    await _memory_append(ctx, session_id, "assistant", reply.answer)
    return reply


@router.get("/compare")
async def ai_compare(request: Request, symbols: str = Query(...)) -> dict:
    store = request.app.state.store
    requested = [s.strip() for s in symbols.split(",") if s.strip()][:10]
    resolved = await resolve_symbols(store, requested)
    return await build_compare(store, resolved)


@router.get("/compare/summary")
async def ai_compare_summary(request: Request, symbols: str = Query(...)) -> dict:
    store = request.app.state.store
    requested = [s.strip() for s in symbols.split(",") if s.strip()][:10]
    resolved = await resolve_symbols(store, requested)
    return await compare_summary(store, resolved)