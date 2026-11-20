"""Shared helpers for the AI research modules.

Private module — not registered in ``MODULES``. Everything here is
deterministic formatting/metrics glue so each module's fallback path can render
useful, citation-carrying markdown with no LLM.
"""

from __future__ import annotations

import re
from collections.abc import Sequence

from app.ai.base import AIContext
from app.ai.citations import cite
from app.ai.llm import get_llm as _get_llm_client
from app.data.contract import AnnualFinancials, Citation, Company

_YEAR_DIGITS_RE = re.compile(r"\d+")


def ensure_llm(ctx: AIContext) -> None:
    """Make ``ctx.llm`` a concrete client so ``rag.grounded`` never sees ``None``."""
    if ctx.llm is None:
        ctx.llm = _get_llm_client()


def year_key(year: str) -> int:
    match = _YEAR_DIGITS_RE.search(year or "")
    return int(match.group()) if match else 0


def sorted_annual(company: Company) -> list[AnnualFinancials]:
    """Annual rows ordered oldest -> newest by fiscal year label."""
    return sorted(company.annual, key=lambda a: year_key(a.year))


def latest_annual(company: Company) -> AnnualFinancials | None:
    rows = sorted_annual(company)
    return rows[-1] if rows else None


def trailing_annual(company: Company, n: int = 3) -> list[AnnualFinancials]:
    return sorted_annual(company)[-n:]


def fmt_num(value: float | None, digits: int = 1) -> str:
    if value is None:
        return "—"
    av = abs(value)
    sign = "-" if value < 0 else ""
    for unit, scale in (("T", 1e12), ("B", 1e9), ("M", 1e6), ("K", 1e3)):
        if av >= scale:
            return f"{sign}{av / scale:.{digits}f}{unit}"
    return f"{value:,.{digits}f}"


def compact_pct(value: float | None, digits: int = 1) -> str:
    if value is None:
        return "—"
    return f"{value:.{digits}f}%"


def fmt_float(value: float | None, digits: int = 1) -> str:
    """Fixed-decimal formatting for optional metrics; ``—`` when unavailable."""
    if value is None:
        return "—"
    return f"{value:.{digits}f}"


def currency_symbol(company: Company) -> str:
    return "₹" if (company.profile.currency or "").upper() == "INR" else "\\$"


def cagr(values: Sequence[float], periods: int | None = None) -> float | None:
    """Compound annual growth rate (%) over the window, else mean YoY growth."""
    window = list(values)
    if len(window) < 2:
        return None
    first, last = window[0], window[-1]
    span = (periods or len(window) - 1)
    if first and first > 0 and last and last > 0:
        return ((last / first) ** (1.0 / max(span, 1)) - 1.0) * 100.0
    deltas = [
        ((b - a) / a) * 100.0 for a, b in zip(window, window[1:]) if a
    ]
    return (sum(deltas) / len(deltas)) if deltas else None


def median(values: Sequence[float]) -> float | None:
    nums = [v for v in values if v is not None]
    if not nums:
        return None
    ordered = sorted(nums)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return float(ordered[mid])
    return (ordered[mid - 1] + ordered[mid]) / 2.0


def clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


def linear(value: float, lo: float, hi: float) -> float:
    """Map a value across [lo, hi] to [0, 100], clamped."""
    if hi == lo:
        return 50.0
    return clamp((value - lo) / (hi - lo) * 100.0)


def sources_markdown(citations: Sequence[Citation], question: str = "") -> str:
    """Deterministic SOURCES footer used by fallback replies."""
    cits = cite(citations)
    if not cits:
        return "_No documents were retrieved to cite._"
    lines = [f"### Sources{f' for: {question}' if question else ''}", ""]
    for c in cits:
        lines.append(f"- {c.title} (p.{c.page} · {c.source}) — {c.snippet.strip()[:200]}")
    return "\n".join(lines)