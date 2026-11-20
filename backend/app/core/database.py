"""Optional async database engine/session factory.

The engine is only constructed when ``database_url`` is set and reachable.
When the database is disabled (offline mode) all accessors return ``None``.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings


class Database:
    """Lazily builds an async engine from settings."""

    def __init__(self) -> None:
        settings = get_settings()
        self._url: str = settings.database_url
        self._engine: AsyncEngine | None = None
        self._session_factory: async_sessionmaker[AsyncSession] | None = None

    def configure(self) -> None:
        """Build the engine (and session factory) when the DB is enabled."""
        if not self._url:
            return
        self._engine = create_async_engine(self._url, echo=False, pool_pre_ping=True)
        self._session_factory = async_sessionmaker(
            self._engine, class_=AsyncSession, expire_on_commit=False
        )

    def get_engine(self) -> AsyncEngine | None:
        """Return the configured engine, or ``None`` when DB is disabled."""
        if self._engine is None:
            self.configure()
        return self._engine

    def get_session_factory(self) -> async_sessionmaker[AsyncSession] | None:
        """Return the session factory, or ``None`` when DB is disabled."""
        if self._session_factory is None:
            self.get_engine()
        return self._session_factory

    async def dispose(self) -> None:
        """Dispose of the engine if it was constructed."""
        if self._engine is not None:
            await self._engine.dispose()


database = Database()


engine: AsyncEngine | None = database.get_engine()
session_factory: async_sessionmaker[AsyncSession] | None = database.get_session_factory()