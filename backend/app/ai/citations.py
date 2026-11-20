"""Citation helpers for the AI engine."""

from __future__ import annotations

from app.data.contract import Citation, DataStore, SearchQuery


def dedupe(citations: list[Citation]) -> list[Citation]:
    """De-duplicate citations by document+page, keeping the highest score."""
    seen: dict[tuple[str, int], Citation] = {}
    for c in citations:
        key = (c.documentId, c.page)
        if key not in seen or c.score > seen[key].score:
            seen[key] = c
    return sorted(seen.values(), key=lambda c: -c.score)


def source_block(citations: list[Citation], max_chars: int = 5000) -> str:
    """Render citations as a numbered SOURCES block for an LLM prompt."""
    if not citations:
        return "No sources were found."
    lines = ["SOURCES (use these to answer; cite by number):"]
    used = 0
    for i, c in enumerate(citations, start=1):
        snippet = c.snippet.strip().replace("\n", " ")
        if used + len(snippet) > max_chars and i > 1:
            break
        lines.append(f"[{i}] {c.title} (p.{c.page}, {c.source}, score {c.score:.2f}): {snippet[:400]}")
        used += len(snippet)
    return "\n".join(lines)


def cite(citations: list[Citation], limit: int = 6) -> list[Citation]:
    """Top citations for attaching to an ``AIReply``."""
    return dedupe(citations)[:limit]


def banner() -> str:
    """System prompt banner for the analyst engine."""
    return (
        "You are InvestIQ, a quantitative equity research assistant. Answer strictly from the "
        "retrieved sources and cite them by number ([1], [2]) after every factual claim. Whenever a "
        "fact is not supported by the sources, say so explicitly. Be concrete, quantitative and hedge "
        "suitably; never invent financial figures."
    )


def context_block(question: str = "", citations: list[Citation] | None = None, max_chars: int = 6000) -> str:
    """Numbered, LLM-ready rendering of citations with a leading context line."""
    citations = citations or []
    block = source_block(citations, max_chars=max_chars)
    if not question:
        return block
    return f"Context field for: {question}\n\n{block}"


async def retrieve(
    store: DataStore,
    query: str,
    limit: int = 6,
    company: str | None = None,
) -> list[Citation]:
    """Semantic retrieval over document chunks, optionally restricted to a company."""
    result = await store.semantic_search(SearchQuery(query=query, limit=limit, company=company))
    hits = list(result.hits or [])
    if company and hits:
        documents = await store.get_documents(company)
        doc_ids = {d.id for d in documents}
        hits = [h for h in hits if h.documentId in doc_ids]
    return dedupe(hits)[:limit]


async def company_context(store: DataStore, slug: str, limit: int = 10) -> list[Citation]:
    """One citation per top filing for a company (for grounded context)."""
    citations: list[Citation] = []
    documents = await store.get_documents(slug)
    for doc in documents[:limit]:
        chunks = await store.get_document_chunks(doc.id)
        if not chunks:
            continue
        snippet = chunks[0].text.strip().replace("\n", " ")
        citations.append(
            Citation(
                id=f"{doc.id}:p{chunks[0].page}",
                documentId=doc.id,
                title=doc.title,
                source=doc.source,
                page=chunks[0].page,
                snippet=snippet[:400],
                score=1.0,
            )
        )
    return dedupe(citations)[:limit]


async def file_citation(store: DataStore, document_id: str) -> Citation | None:
    """A single citation for one document (used by the document summarizer)."""
    for summary in await store.list_companies():
        company = await store.get_company(summary.slug)
        if company is None:
            continue
        doc = next((d for d in company.documents if d.id == document_id), None)
        if doc is None:
            continue
        chunks = await store.get_document_chunks(document_id)
        if chunks:
            snippet = chunks[0].text.strip().replace("\n", " ")
            return Citation(
                id=document_id,
                documentId=document_id,
                title=doc.title,
                source=doc.source,
                page=chunks[0].page,
                snippet=snippet[:400],
                score=1.0,
            )
        return Citation(
            id=document_id,
            documentId=document_id,
            title=doc.title,
            source=doc.source,
            page=doc.pages,
            snippet=doc.title,
            score=1.0,
        )
    return None