"""Aggregate API router wiring all version-1 endpoint modules."""

from fastapi import APIRouter

from app.api.v1 import ai, ai_local, companies, documents, freshness, health, live, market, notifications, search, watchlists

api_router = APIRouter()
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(freshness.router, prefix="/freshness", tags=["health"])
api_router.include_router(companies.router, prefix="/companies", tags=["companies"])
api_router.include_router(search.router, prefix="/search", tags=["search"])
api_router.include_router(documents.router, prefix="/documents", tags=["documents"])
api_router.include_router(watchlists.router, prefix="/watchlists", tags=["watchlists"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(market.router, prefix="/market", tags=["market"])
api_router.include_router(ai.router, prefix="/ai", tags=["ai"])
api_router.include_router(live.router, prefix="/live", tags=["live-data"])
api_router.include_router(ai_local.router, prefix="/ai-local", tags=["grounded-ai"])

__all__ = ["api_router"]