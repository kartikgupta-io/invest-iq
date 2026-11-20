"""Optional SQLAlchemy ORM scaffolding.

Not required for the offline runtime; models simply mirror a minimal set of
a company's annual financials row for a future database-backed store.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, func
from sqlalchemy.ext.asyncio import AsyncAttrs
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(AsyncAttrs, DeclarativeBase):
    pass


class AnnualFinancialsRow(Base):
    """Mirror of a single annual financials row for a company."""

    __tablename__ = "annual_financials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    year: Mapped[str] = mapped_column(String(16), index=True, nullable=False)
    revenue: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    net_income: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    eps: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())