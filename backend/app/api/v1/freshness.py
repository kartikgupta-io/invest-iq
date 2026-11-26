"""Data freshness endpoint — reports the age of the live on-disk snapshot."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Request

from app.data import live_sources as live
from app.data.live_sources import cache_ttl_seconds, get_cached, is_fresh
from app.data.store import build_store

router = APIRouter()

STALE_AFTER_SECONDS = cache_ttl_seconds()


@router.get("")
def freshness() -> dict[str, object]:
    """Report when the live Yahoo Finance + Screener.in snapshot was saved.

    ``status`` is ``offline`` when no snapshot has ever been saved, ``fresh``
    when the snapshot is inside the live cache TTL, and ``stale`` otherwise.
    """
    cache = get_cached()
    saved_at = cache.get("savedAt")
    age_seconds = 0
    if saved_at:
        try:
            saved = datetime.fromisoformat(str(saved_at))
        except (TypeError, ValueError):
            saved = None
        if saved is not None:
            if saved.tzinfo is None:
                saved = saved.replace(tzinfo=timezone.utc)
            age_seconds = max(0, int((datetime.now(timezone.utc) - saved).total_seconds()))

    if not saved_at:
        status = "offline"
    elif is_fresh(str(saved_at)):
        status = "fresh"
    else:
        status = "stale"

    return {
        "status": status,
        "asOf": saved_at,
        "ageSeconds": age_seconds,
        "staleAfterSeconds": STALE_AFTER_SECONDS,
        "indexStaleAfterSeconds": live.index_ttl_seconds(),
        "source": "Yahoo Finance + Screener.in",
    }


@router.post("/refresh")
async def refresh(request: Request) -> dict[str, object]:
    """Re-harvest Yahoo Finance + Screener.in and rebuild the in-memory store.

    The UI's "Refresh now" action calls this endpoint. Re-runs the same
    harvest as ``scripts.refresh_data`` and swaps ``app.state.store`` so the
    very next ``/companies`` or ``/market/indices`` request serves the new
    snapshot — no process restart required.
    """
    cache = await live.refresh()
    request.app.state.store = build_store()
    return {
        "status": "fresh" if is_fresh(cache.get("savedAt")) else "stale",
        "asOf": cache.get("savedAt"),
        "quotes": len(cache.get("quotes") or {}),
        "profiles": len(cache.get("profiles") or {}),
        "indices": len(cache.get("indices") or {}),
        "source": "Yahoo Finance + Screener.in",
    }
