"""RAG pipeline: retrieve grounded chunks, then answer with the LLM.

Every answer is built from retrieved citations, so the model can only reason
over the supplied filings/trusted data. When the LLM is unavailable a
caller-provided ``fallback`` (or a plain source summary) is used instead.
"""

from __future__ import annotations

from typing import AsyncIterator

from app.ai.base import AIReply, AIContext, FallbackFn
from app.ai.citations import cite, dedupe, source_block
from app.ai.llm import get_llm
from app.data.contract import Citation, SearchQuery


async def retrieve(
    ctx: AIContext,
    question: str,
    company: str | None = None,
    limit: int = 6,
) -> list[Citation]:
    """Semantic retrieval over document chunks; optionally restricted to a company."""
    result = await ctx.store.semantic_search(
        SearchQuery(query=question, limit=limit, company=company)
    )
    hits = list(result.hits or [])
    if company and hits:
        documents = await ctx.store.get_documents(company)
        doc_ids = {d.id for d in documents}
        hits = [h for h in hits if h.documentId in doc_ids]
    return dedupe(hits)


def _prompt(system: str, question: str, citations: list[Citation]) -> list[dict]:
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": f"QUESTION:\n{question}\n\n{source_block(citations)}"},
    ]


def _fallback_reply(question: str, citations: list[Citation]) -> AIReply:
    if not citations:
        return AIReply(
            answer="No relevant filings were found for this question. Try rephrasing or picking a company.",
            citations=[],
            mode="fallback",
        )
    lines = [f"### Sources for: {question}", ""]
    lines += [f"- {c.title} (p.{c.page} · {c.source}) — {c.snippet[:200]}" for c in cite(citations)]
    return AIReply(answer="\n".join(lines), citations=cite(citations), mode="fallback")


async def grounded(
    ctx: AIContext,
    question: str,
    system: str,
    company: str | None = None,
    limit: int = 6,
    fallback: FallbackFn | None = None,
) -> AIReply:
    """Retrieve -> prompt -> complete (live) or fallback (deterministic)."""
    citations = await retrieve(ctx, question, company, limit)
    messages = _prompt(system, question, citations)
    answer = await ctx.llm.complete(messages)
    if answer and answer.strip():
        return AIReply(answer=answer.strip(), citations=cite(citations), mode="live", model=ctx.llm.model)
    if fallback is not None:
        return fallback(ctx, citations)
    return _fallback_reply(question, citations)


async def grounded_stream(
    ctx: AIContext,
    question: str,
    system: str,
    company: str | None = None,
    limit: int = 6,
    fallback: FallbackFn | None = None,
) -> AsyncIterator[str]:
    """Stream a grounded answer, falling back to a buffered deterministic reply."""
    yielded = False
    citations = await retrieve(ctx, question, company, limit)
    messages = _prompt(system, question, citations)
    try:
        async for delta in ctx.llm.stream(messages):
            yielded = True
            yield delta
    except Exception:
        yielded = False
    if not yielded:
        answer = fallback(ctx, citations).answer if fallback else _fallback_reply(question, citations).answer
        yield answer