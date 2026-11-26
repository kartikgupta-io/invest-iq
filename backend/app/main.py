"""InvestIQ FastAPI application factory."""
import asyncio
import logging
import os
from contextlib import asynccontextmanager, suppress
from functools import cache

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api.v1 import api_router
from app.core.config import get_settings
from app.data.contract import DataStore

logger = logging.getLogger("investiq")


@cache
def _store() -> DataStore:
    from app.data.store import build_store

    return build_store()


async def _auto_refresh_loop(app: FastAPI, interval_seconds: int) -> None:
    """Keep the snapshot current on long-running servers without user action."""
    from app.data import live_sources as live

    while True:
        await asyncio.sleep(interval_seconds)
        try:
            await live.refresh()
            # Rebuild the read store so company pages, indices and notifications
            # all see the same freshly harvested snapshot.
            from app.data.store import build_store

            app.state.store = build_store()
            logger.info("Auto-refreshed live InvestIQ snapshot")
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 - never let a failed poll kill the loop
            logger.warning("Live auto-refresh failed: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task: asyncio.Task | None = None
    try:
        interval = int(os.getenv("INVESTIQ_AUTO_REFRESH_SECONDS", "300"))
    except ValueError:
        interval = 300
    if interval > 0 and os.getenv("INVESTIQ_AUTO_REFRESH", "1") != "0":
        task = asyncio.create_task(_auto_refresh_loop(app, interval))
    yield
    if task is not None:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="InvestIQ API", lifespan=lifespan)
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
