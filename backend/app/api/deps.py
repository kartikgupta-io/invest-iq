"""Shared FastAPI dependencies."""

from fastapi import Request

from app.data.contract import DataStore


def get_store(request: Request) -> DataStore:
    """Resolve the application's lazily-built ``DataStore`` instance."""
    return request.app.state.store