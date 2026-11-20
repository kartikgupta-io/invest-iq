"""Embedding helpers: live LM Studio client, cosine similarity, hashed fallback."""

from collections.abc import Sequence

import hashlib
import math

import httpx

from app.core.config import Settings

_DIM = 384


def embed_texts(texts: Sequence[str], settings: Settings) -> list[list[float]]:
    """Embed a batch of texts via the LM Studio /v1/embeddings endpoint (5s timeout).

    Raises on any failure so callers can fall back to hashed vectors.
    """
    url = f"{settings.lm_studio_url.rstrip('/')}/v1/embeddings"
    response = httpx.post(
        url,
        json={"model": settings.embedding_model, "input": list(texts)},
        timeout=5.0,
    )
    response.raise_for_status()
    data = response.json()
    items = sorted(data["data"], key=lambda item: item["index"])
    return [list(item["embedding"]) for item in items]


def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    """Cosine similarity of two equal-length vectors."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


def hash_embed(text: str, dim: int = _DIM) -> list[float]:
    """Deterministic, dimension-stable hashed embedding. Same text => same vector."""
    vector: list[float] = []
    for i in range(dim):
        digest = hashlib.blake2b(f"{text}::{i}".encode("utf-8"), digest_size=4).digest()
        value = int.from_bytes(digest, "little") / 0xFFFFFFFF
        vector.append(value * 2.0 - 1.0)
    norm = math.sqrt(sum(x * x for x in vector))
    if norm > 0.0:
        vector = [x / norm for x in vector]
    return vector