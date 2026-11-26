"""Grounded local AI — real models only, no canned answers.

One on-device path is used: LM Studio's OpenAI-compatible server
(``http://127.0.0.1:1234/v1``). Browser built-in AI and Apple's native
framework were verified as unavailable to this web app, so no extra tiers are
implemented.

When no model is reachable the endpoint still returns the *real* retrieved
evidence and an explicit ``available: False``. It never fabricates an answer.
"""

from __future__ import annotations

import os
import re
from typing import Any

import httpx
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.data import alternate_sources as alt
from app.data import live_sources as live
from app.data.live_sources import build_evidence, get_cached, search_evidence

router = APIRouter()

LM_STUDIO_URL = os.getenv("LM_STUDIO_URL", "http://127.0.0.1:1234").rstrip("/")
GENERATION_TIMEOUT = float(os.getenv("LOCAL_AI_TIMEOUT_SECONDS", "45"))
DISCOVERY_TIMEOUT = 3.0

_SYSTEM_PROMPT = (
    "You are a careful equity research assistant. Answer ONLY from the numbered "
    "evidence snippets provided by the user. Cite every factual claim with the "
    "matching [n] marker. If the snippets do not contain enough information, say "
    "exactly that and do not guess. Never use outside knowledge, never invent "
    "numbers, and never present a value that is not present in the snippets."
)


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    limit: int = Field(default=6, ge=1, le=10)
    # When set, evidence is scoped to one Indian security and, if needed,
    # harvested on demand from Yahoo/Screener plus real secondary sources.
    company: str | None = Field(default=None, max_length=160)


class SourceHit(BaseModel):
    id: str
    company: str
    title: str
    snippet: str
    url: str
    score: float


class AskResponse(BaseModel):
    question: str
    company: str | None = None
    available: bool
    answer: str | None = None
    sources: list[SourceHit]
    provider: str | None = None
    model: str | None = None
    reason: str | None = None
    asOf: str | None = None


class StatusResponse(BaseModel):
    available: bool
    provider: str | None = None
    model: str | None = None
    checked: list[str]
    browserPromptApi: str = "detected in the browser by the client"
    note: str = "Apple Foundation Models are native-only and cannot be called from a web page."


def _is_chat_model(model_id: str) -> bool:
    lowered = model_id.lower()
    return not any(word in lowered for word in ("embed", "nomic", "bert"))


async def _discover(client: httpx.AsyncClient, provider: str, base: str) -> tuple[str, str] | None:
    """Return (provider, model_id) when an OpenAI-compatible chat model is live."""
    try:
        response = await client.get(f"{base}/v1/models", timeout=DISCOVERY_TIMEOUT)
        response.raise_for_status()
        payload = response.json()
        ids = [
            str(item.get("id", ""))
            for item in (payload.get("data") or [])
            if isinstance(item, dict)
        ]
        model = next((item for item in ids if item and _is_chat_model(item)), None)
        if model:
            return provider, model
    except Exception:
        return None
    return None


async def detect_provider() -> tuple[str, str] | None:
    """Return the local LM Studio chat model, or None when none is running."""
    async with httpx.AsyncClient() as client:
        return await _discover(client, "LM Studio", LM_STUDIO_URL)


def _company_slug(company: str) -> str | None:
    """Map a name, ticker or slug from a search result to a canonical slug."""
    term = str(company).strip()
    if not term:
        return None
    key = term.lower()
    if live.universe.by_slug(key) or key in live.UNIVERSE or live.discovered_entry_for(key):
        return key
    ticker = key.upper().replace(" ", "")
    if ticker.endswith((".NS", ".BO")):
        return live.slug_from_ticker(ticker)
    local = live.universe.search(term, limit=3)
    if local:
        return str(local[0].get("slug") or "").strip().lower() or None
    return re.sub(r"[^a-z0-9]+", "-", key).strip("-") or None


async def _secondary_evidence(company: str, slug: str | None, limit: int) -> list[dict[str, Any]]:
    """Real, citable snippets from independent sources for any Indian security."""
    if limit <= 0:
        return []
    symbol = ""
    entry = live.discovered_entry_for(slug) if slug else None
    if isinstance(entry, dict):
        symbol = str(entry.get("ticker") or "")
    if not symbol and slug:
        local = live.universe.by_slug(slug)
        if isinstance(local, dict) and local.get("symbol"):
            symbol = f"{str(local['symbol']).upper()}.NS"

    items: list[dict[str, Any]] = []
    news = await alt.fetch_google_news(f"{company} India shares", limit=limit)
    for row in news:
        url = str(row.get("url") or "")
        if not url.startswith("https://"):
            continue
        items.append({
            "id": str(row.get("id") or url),
            "company": company,
            "title": str(row.get("title") or "News"),
            "snippet": f"{row.get('publisher') or 'News report'}; published {row.get('publishedAt') or 'date unavailable'}",
            "url": url,
            "score": 0.5,
        })
    wiki = await alt.fetch_wikipedia_summary(company)
    if wiki and str(wiki.get("extract") or ""):
        url = str(wiki.get("url") or "")
        if url.startswith("https://"):
            items.append({
                "id": f"wiki-{re.sub(r'[^a-z0-9]+', '-', company.lower()).strip('-')}",
                "company": company,
                "title": f"Background — {wiki.get('title') or company}",
                "snippet": str(wiki["extract"])[:600],
                "url": url,
                "score": 0.5,
            })
    if symbol:
        announcements = await alt.fetch_nse_announcements(symbol, limit=min(3, limit))
        for row in announcements:
            url = str(row.get("url") or "")
            if not url.startswith("https://"):
                continue
            items.append({
                "id": str(row.get("id") or url),
                "company": company,
                "title": str(row.get("title") or "NSE announcement"),
                "snippet": f"NSE filing: {row.get('title') or ''}; {row.get('publishedAt') or ''}",
                "url": url,
                "score": 0.5,
            })
    return items[:limit]


async def _real_evidence(
    question: str, limit: int, company: str | None = None
) -> tuple[list[dict[str, Any]], str | None]:
    """Retrieve real snippets, optionally scoped to one searched security."""
    if company:
        term = company.strip()
        slug = _company_slug(term)
        cache = await live.ensure_company(slug) if slug else None
        cache = cache or live.get_cached()
        profile = (cache.get("profiles") or {}).get(slug or "")
        evidence = build_evidence({slug: profile} if profile else {})
        hits = search_evidence(evidence, f"{term} {question}", limit=limit) if evidence else []
        seen_urls = {str(hit.get("url") or "") for hit in hits}
        for hit in await _secondary_evidence(term, slug, limit - len(hits)):
            if str(hit.get("url") or "") not in seen_urls:
                hits.append(hit)
                seen_urls.add(str(hit["url"]))
        return hits[:limit], cache.get("savedAt")

    cache = get_cached()
    evidence = build_evidence(cache.get("profiles") or {})
    hits = search_evidence(evidence, question, limit=limit) if evidence else []
    return hits, cache.get("savedAt")


def _build_prompt(question: str, hits: list[dict[str, Any]]) -> str:
    lines = [f"Question: {question}", "", "Evidence snippets (real, retrieved):"]
    for index, hit in enumerate(hits, start=1):
        lines.append(
            f"[{index}] {hit.get('company', 'Unknown')} — {hit.get('title', '')}\n"
            f"    {hit.get('snippet', '')}\n"
            f"    URL: {hit.get('url', '')}"
        )
    lines.extend(["", "Answer with inline [n] citations."])
    return "\n".join(lines)


async def _generate(
    provider: str, model: str, question: str, hits: list[dict[str, Any]]
) -> str:
    base = LM_STUDIO_URL
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": _build_prompt(question, hits)},
        ],
        "temperature": 0,
        "max_tokens": 420,
        "stream": False,
    }
    async with httpx.AsyncClient(timeout=GENERATION_TIMEOUT) as client:
        response = await client.post(f"{base}/v1/chat/completions", json=payload)
        response.raise_for_status()
        data = response.json()
    try:
        return str(data["choices"][0]["message"]["content"]).strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError("Local model returned an unexpected response shape") from exc


@router.get("/status", response_model=StatusResponse)
async def ai_status() -> StatusResponse:
    found = await detect_provider()
    return StatusResponse(
        available=found is not None,
        provider=found[0] if found else None,
        model=found[1] if found else None,
        checked=[f"LM Studio {LM_STUDIO_URL}/v1/models"],
    )


@router.post("/ask", response_model=AskResponse)
async def ai_ask(request: AskRequest) -> AskResponse:
    hits, saved_at = await _real_evidence(request.question, request.limit, request.company)
    sources = [
        SourceHit(
            id=str(hit.get("id", "")),
            company=str(hit.get("company", "")),
            title=str(hit.get("title", "")),
            snippet=str(hit.get("snippet", "")),
            url=str(hit.get("url", "")),
            score=float(hit.get("score") or 0.0),
        )
        for hit in hits
    ]
    base = dict(
        question=request.question,
        company=request.company,
        sources=sources,
        asOf=saved_at,
    )
    if not hits:
        return AskResponse(**base, available=False, reason="No real evidence matched this question.")
    found = await detect_provider()
    if not found:
        return AskResponse(
            **base,
            available=False,
            reason=(
                "No local chat model is running. Start LM Studio (or Ollama), or use a "
                "browser with the built-in Prompt API. The retrieved evidence above is real."
            ),
        )
    provider, model = found
    try:
        answer = await _generate(provider, model, request.question, hits)
    except Exception as exc:  # noqa: BLE001 - surface a clear, honest failure
        return AskResponse(
            **base,
            available=False,
            provider=provider,
            model=model,
            reason=f"The local model failed to generate an answer: {exc}",
        )
    return AskResponse(
        **base,
        available=True,
        answer=answer,
        provider=provider,
        model=model,
    )
