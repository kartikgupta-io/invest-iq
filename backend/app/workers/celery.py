"""Celery entry point: ``celery -A app.workers.celery_app worker -l info``."""

from app.workers.tasks import celery_app

__all__ = ["celery_app"]