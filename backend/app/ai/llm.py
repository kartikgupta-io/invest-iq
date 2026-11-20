"""LLM client for InvestIQ's AI engine.

Talks to a local LM Studio server's OpenAI-compatible ``/v1/chat/completions``
endpoint. Every call is failure-tolerant: when the server is down or the model
is unloaded the methods return ``None`` / emit nothing, so callers always fall
back to deterministic analysis.
"""

from __future__ import annotations

import json
from functools import lru_cache

import httpx

from app.core.config import get_settings


class LLMClient:
    def __init__(self) -> None:
        settings = get_settings()
        self.settings = settings
        self.model = settings.llm_model
        self.base = settings.lm_studio_url.rstrip("/")
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=5.0))

    def available(self) -> bool:
        return self.settings.llm_enabled

    async def complete(
        self,
        messages: list[dict],
        temperature: float = 0.3,
        max_tokens: int = 1200,
    ) -> str | None:
        """Return a full assistant completion, or ``None`` on any failure."""
        if not self.available():
            return None
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False,
        }
        try:
            resp = await self._client.post(f"{self.base}/v1/chat/completions", json=payload)
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
            return content if content and content.strip() else None
        except Exception:
            return None

    async def stream(
        self,
        messages: list[dict],
        temperature: float = 0.3,
        max_tokens: int = 1200,
    ):
        """Yield content deltas from a streaming completion; may yield nothing."""
        if not self.available():
            return
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }
        try:
            async with self._client.stream("POST", f"{self.base}/v1/chat/completions", json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    data = line[len("data:"):].strip()
                    if data == "[DONE]":
                        break
                    try:
                        obj = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    delta = obj.get("choices", [{}])[0].get("delta", {}).get("content")
                    if delta:
                        yield delta
        except Exception:
            return

    async def aclose(self) -> None:
        await self._client.aclose()


@lru_cache
def get_llm() -> LLMClient:
    """Process-wide singleton LLM client."""
    return LLMClient()