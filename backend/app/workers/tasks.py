"""Celery application and task wiring for InvestIQ ingest/extract/embed jobs."""

from __future__ import annotations

import logging

import celery
import redis

from app.core.config import get_settings

logger = logging.getLogger("app.workers")

settings = get_settings()


def _broker_url() -> str:
    try:
        client = redis.Redis.from_url(settings.redis_url, socket_connect_timeout=1)
        client.ping()
        client.close()
        return settings.redis_url
    except Exception:
        logger.warning("Redis unavailable at %s; falling back to memory:// broker.", settings.redis_url)
        return "memory://"


celery_app = celery.Celery(
    "investiq",
    broker=_broker_url(),
    backend="rpc://",
    broker_connection_retry_on_startup=True,
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    include=["app.workers.tasks"],
)


@celery_app.task(name="app.ingest_company", bind=True)
def ingest_company(self, symbol: str) -> str:
    """Fetch and persist a company by ticker/symbol (thin wiring)."""
    logger.info("ingest_company task received for %s (request id %s).", symbol, self.request.id)
    return f"queued ingest for {symbol}"


@celery_app.task(name="app.extract_document", bind=True)
def extract_document(self, document_id: str) -> str:
    """Chunk a document's PDF into searchable chunks. Thin wiring only."""
    logger.info("extract_document task received: %s", document_id)
    return f"queued extraction for {document_id}"


@celery_app.task(name="app.embed_chunks", bind=True)
def embed_chunks(self, document_id: str) -> str:
    """Generate embeddings for a document's chunks. Thin wiring only."""
    logger.info("embed_chunks task received: %s", document_id)
    return f"queued embedding for {document_id}"