"""AI engine contract for InvestIQ.

Shared types + the ``AIContext`` bundle that every AI module, the RAG layer,
the LLM client and conversation-memory store use. Every module returns an
``AIReply`` whose markdown ``answer`` is grounded in ``citations`` that point
at underlying document chunks, so all factual statements are explainable.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Callable, Literal

from pydantic import BaseModel, Field

from app.data.contract import Citation, DataStore

if TYPE_CHECKING:
    from app.ai.llm import LLMClient
    from app.ai.memory import Memory


class Message(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class AIRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    company: str | None = None
    companies: list[str] = Field(default_factory=list)
    session_id: str | None = None
    stream: bool = False


class AIReply(BaseModel):
    answer: str
    citations: list[Citation] = Field(default_factory=list)
    mode: Literal["live", "fallback"] = "live"
    model: str = ""
    tokens: int = 0
    latency_ms: int = 0


@dataclass
class AIContext:
    """Bundles the read boundary plus lazily-resolved AI singletons."""

    store: DataStore
    compact: str = ""
    llm: LLMClient | None = None
    memory: Memory | None = None


FallbackFn = Callable[[AIContext, list[Citation]], AIReply]