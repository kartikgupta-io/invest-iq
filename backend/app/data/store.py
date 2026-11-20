"""Factory and lazy singleton accessors for the data store."""

from __future__ import annotations

from app.data.offline import OfflineDataStore

_store: OfflineDataStore | None = None


def build_store() -> OfflineDataStore:
    """Construct a fresh, file-backed offline store."""
    return OfflineDataStore()


def get_store() -> OfflineDataStore:
    """Return the process-wide data store, building it once on first use."""
    global _store
    if _store is None:
        _store = build_store()
    return _store