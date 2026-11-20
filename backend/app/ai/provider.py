"""LLM provider abstraction.

- :class:`LmStudioProvider` streams chat tokens from an LM Studio
  OpenAI-compatible endpoint.
- :class:`OfflineEngine` produces deterministic, citation-backed analysis
  text from the data itself (the safety net that guarantees explainable,
  source-referenced output with no network and no model).
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from functools import lru_cache

import httpx

from app.core.config import Settings, get_settings

_CHAT_URL = "{base}/v1/chat/completions"
_AVAILABILITY_TTL = 45.0


class LLMProvider:
    available: bool = False

    async def stream_chat(self, messages: list[dict]) -> AsyncIterator[str]:
        raise NotImplementedError

    async def chat(self, messages: list[dict]) -> str:
        parts: list[str] = []
        async for token in self.stream_chat(messages):
            parts.append(token)
        return "".join(parts)


class LmStudioProvider(LLMProvider):
    def __init__(self, base_url: str, model: str, api_timeout: float = 90.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_timeout = api_timeout
        self.available = self._ping()

    def _ping(self) -> bool:
        try:
            response = httpx.get(f"{self.base_url}/v1/models", timeout=2.5)
            return response.status_code == 200
        except Exception:
            return False

    async def stream_chat(self, messages: list[dict]) -> AsyncIterator[str]:
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "temperature": 0.2,
        }
        async with httpx.AsyncClient(timeout=self.api_timeout) as client:
            async with client.stream(
                "POST", _CHAT_URL.format(base=self.base_url), json=payload
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        chunk = httpx.Response(200, content=data).json()
                    except Exception:
                        continue
                    choices = chunk.get("choices") or []
                    if not choices:
                        continue
                    delta = choices[0].get("delta", {})
                    token = delta.get("content") or delta.get("reasoning_content") or ""
                    if token:
                        yield token


class OfflineEngine(LLMProvider):
    """Wraps a callable answer generator and streams it in sentence chunks."""

    available = True

    def __init__(self, answer_builder) -> None:
        self._builder = answer_builder

    async def chat(self, messages: list[dict]) -> str:
        text = self._builder(messages)
        if asyncio.iscoroutine(text):
            text = await text
        return text if isinstance(text, str) else str(text)

    async def stream_chat(self, messages: list[dict]) -> AsyncIterator[str]:
        text = await self.chat(messages)
        if not text:
            return
        for i in range(0, len(text), 28):
            await asyncio.sleep(0.004)
            yield text[i : i + 28]


@lru_cache(maxsize=1)
def get_llm(settings=None) -> LLMProvider:
    settings = settings or get_settings()
    if settings.ai_provider == "offline":
        from app.ai.offline_engine import OfflineAnswerBuilder

        return OfflineEngine(OfflineAnswerBuilder())
    lms = LmStudioProvider(settings.lm_studio_url, settings.ai_model)
    if lms.available and settings.ai_provider != "offline":
        return lms
    from app.ai.offline_engine import OfflineAnswerBuilder

    return OfflineEngine(OfflineAnswerBuilder())


def check_availability() -> bool:
    """Probe whether the live model answers right now (used by the API layer)."""
    probe = LmStudioProvider(get_settings().lm_studio_url, get_settings().ai_model)
    return probe.available