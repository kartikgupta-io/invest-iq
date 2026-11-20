"""InvestIQ FastAPI application factory."""

from functools import cache

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api.v1 import api_router
from app.core.config import get_settings
from app.data.contract import DataStore


@cache
def _store() -> DataStore:
    from app.data.store import build_store

    return build_store()


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(title="InvestIQ API")
    # gzip JSON responses above 1 KB to keep page loads small on the wire.
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.state.store = _store()
    app.include_router(api_router, prefix=settings.api_prefix)

    @app.middleware("http")
    async def security_headers(request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        return response

    @app.get("/", include_in_schema=False)
    def root() -> dict[str, str]:
        return {
            "name": "InvestIQ API",
            "docs": "/docs",
            "health": f"{settings.api_prefix}/health",
        }

    return app


app = create_app()