"""Background worker wiring (Celery)."""

from app.workers.tasks import celery_app, embed_chunks, extract_document, ingest_company

__all__ = ["celery_app", "embed_chunks", "extract_document", "ingest_company"]