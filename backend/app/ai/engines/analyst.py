"""Financial analyst chat engine.

Live path: RAG context + citation system + conversation memory feed the
streaming LLM provider. Offline path: the deterministic citation-backed
builder. Either way a citation list accompanies the prose.
"""

from __future__ import annotations

from app.ai.citations import banner, context_block, company_context, retrieve
from app.ai.offline_engine import build_offline_answer
from app.data.contract import Citation, DataStore


async def fetch_citations(store: DataStore, question: str, company: str | None) -> list[Citation]:
    citations: list[Citation] = []
    if company:
        citations.extend(await company_context(store, company, limit=3))
    citations.extend(await retrieve(store, question, limit=4))
    seen: set[str] = set()
    unique: list[Citation] = []
    for citation in citations:
        if citation.id not in seen:
            seen.add(citation.id)
            unique.append(citation)
    return unique[:6]


def build_messages(
    question: str,
    company: str | None,
    citations: list[Citation],
    history: list[dict],
) -> list[dict]:
    messages: list[dict] = []
    if history:
        for turn in history[-8:]:
            messages.append({"role": turn["role"], "content": turn["content"]})
    system = banner()
    if company:
        system += f"\n\nYou are focused on the company with slug '{company}'."
    user = f"Question: {question}\n\nRetrieved source material — cite by number:\n{context_block('', citations)}"
    messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": user})
    return messages


async def offline_answer(store: DataStore, question: str) -> tuple[str, list[Citation], str]:
    return await build_offline_answer(store, question)