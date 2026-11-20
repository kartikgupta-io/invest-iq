"""``ratio`` module — financial-ratio explainer.

Detects the metric in ``req.question`` (ROE, ROCE, P/E, debt/equity, net
margin, FCF, ...), then explains definition + formula, shows the company value
(latest + trailing trend) and compares it with peers. The fallback is the same
content templated without any LLM.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from app.ai.base import AIContext, AIRequest, AIReply
from app.ai.citations import cite
from app.ai.modules._common import (
    currency_symbol,
    ensure_llm,
    fmt_num,
    latest_annual,
    median,
    sources_markdown,
    trailing_annual,
)
from app.ai.rag import grounded
from app.data.contract import AnnualFinancials, Citation, Company, PeerCompany

NAME = "ratio"

SYSTEM = (
    "You are InvestIQ's ratios & metrics explainer.\n"
    "Rules:\n"
    "1. Use ONLY the SOURCES block and the structured metric context; never "
    "invent definitions, formulas or company figures.\n"
    "2. Cite every company figure with the source index in brackets, e.g. "
    "'ROE of 11% vs sector 14% [1]'.\n"
    "3. Structure the answer: definition, formula, company value (latest + "
    "trailing trend), peer comparison, then 'how to read it'.\n"
    "4. If the SOURCES block is empty, say the numbers come from structured "
    "financial data, not the raw document."
)


@dataclass(frozen=True)
class RatioSpec:
    key: str
    label: str
    definition: str
    formula: str
    value: Callable[[AnnualFinancials], float | None]
    peer: Callable[[PeerCompany], float | None]
    how_to_read: str


def _metrics() -> list[RatioSpec]:
    return [
        RatioSpec(
            key="roe", label="ROE (return on equity)",
            definition="Net income as a percentage of shareholders' equity — how efficiently the company earns on owners' capital.",
            formula="ROE = Net income / Average shareholders' equity × 100",
            value=lambda a: a.roe, peer=lambda p: p.roe,
            how_to_read="Higher is generally better; compare with sector peers and the company's own history — sustainable ROE needs margins, asset turnover and controlled leverage.",
        ),
        RatioSpec(
            key="roce", label="ROCE (return on capital employed)",
            definition="Operating profit relative to the capital invested (equity + debt), isolating operating efficiency independent of capital structure.",
            formula="ROCE = EBIT / Capital employed × 100",
            value=lambda a: a.roce, peer=lambda p: p.roe,
            how_to_read="Preferred across businesses with different capital structures; ROCE above the cost of capital signals value creation.",
        ),
        RatioSpec(
            key="pe", label="P/E (price-to-earnings)",
            definition="Price per share divided by earnings per share — the multiple investors pay for each rupee of profit.",
            formula="P/E = Market price / EPS",
            value=lambda a: a.peRatio, peer=lambda p: p.peRatio,
            how_to_read="High P/E can mean expected growth or overvaluation; low P/E can mean a bargain or weak prospects. Always read against peers and growth.",
        ),
        RatioSpec(
            key="debt-to-equity", label="Debt/equity",
            definition="Total debt divided by total equity — a measure of financial leverage.",
            formula="D/E = Total debt / Total shareholders' equity",
            value=lambda a: a.debtToEquity, peer=lambda p: p.roe,
            how_to_read="Below ~1.0 with healthy interest cover is usually seen as a strong balance sheet; higher leverage amplifies earnings swings.",
        ),
        RatioSpec(
            key="net-margin", label="Net margin",
            definition="Net income as a percentage of revenue — the share of every sale kept as profit after all costs.",
            formula="Net margin = Net income / Revenue × 100",
            value=lambda a: a.netMargin, peer=lambda p: p.margin,
            how_to_read="Higher margin means more pricing power / cost efficiency; watch the trend for compression or expansion.",
        ),
        RatioSpec(
            key="fcf", label="Free cash flow (FCF)",
            definition="Cash generated after operating expenses and capital expenditure — the cash available for dividends, buybacks and deleveraging.",
            formula="FCF = Operating cash flow − Capital expenditure",
            value=lambda a: a.freeCashFlow, peer=lambda p: None,
            how_to_read="Positive and growing FCF supports dividends and self-funding growth; low conversion from net income deserves scrutiny.",
        ),
    ]


def _detect(question: str) -> RatioSpec | None:
    q = (question or "").lower()
    rules = [
        ("roe", ("roe", "return on equity")),
        ("roce", ("roce", "return on capital employed", "capital employed")),
        ("pe", ("pe", "p/e", "price-to-earnings", "price to earnings")),
        ("debt-to-equity", ("debt/equity", "debt to equity", "leverage", "d/e")),
        ("net-margin", ("net margin", "netmargin", "profit margin")),
        ("fcf", ("fcf", "free cash", "cash flow")),
    ]
    for key, needles in rules:
        if any(n in q for n in needles):
            return next(m for m in _metrics() if m.key == key)
    return None


def _trend(company: Company, spec: RatioSpec) -> list[tuple[str, float | None]]:
    return [(a.year, spec.value(a)) for a in trailing_annual(company, 3)]


def _ratio_fallback(company: Company | None, spec: RatioSpec | None, peers: list[PeerCompany]):
    def fallback(ctx: AIContext, citations: list[Citation]) -> AIReply:
        cits = cite(citations)
        if company is None or spec is None:
            supported = ", ".join(m.key for m in _metrics())
            return AIReply(
                answer=(
                    "I need a company and a recognised metric to explain. Supported "
                    f"metrics: {supported}.\n\n" + sources_markdown(cits)
                ),
                citations=cits,
                mode="fallback",
            )
        sy = currency_symbol(company)
        latest = latest_annual(company)
        trend = _trend(company, spec)
        peer_list = peers or []
        peer_values = [spec.peer(p) for p in peer_list]
        peer_mid = median([v for v in peer_values if v is not None])
        value = spec.value(latest) if latest else None
        latest_line = f"**Latest value:** {fmt_num(value) if value is not None else '—'}"
        if spec.key == "fcf" and value is not None:
            latest_line += f" ({sy})"
        lines = [
            f"### {spec.label} — {company.profile.name} ({company.profile.ticker})",
            "",
            f"**Definition:** {spec.definition}",
            "",
            f"**Formula:** `{spec.formula}`",
            "",
            latest_line,
            "",
            "| Period | Value |",
            "|:--|--:|",
        ]
        for year, v in trend:
            lines.append(f"| {year} | {fmt_num(v) if v is not None else '—'} |")
        lines += [
            "",
            f"**Peer comparison:** sector median {fmt_num(peer_mid) if peer_mid is not None else '—'} "
            f"across {len(peer_list)} peers.",
            "",
            f"**How to read it:** {spec.how_to_read}",
            "",
            sources_markdown(cits),
        ]
        return AIReply(answer="\n".join(lines), citations=cits, mode="fallback")

    return fallback


async def run(ctx: AIContext, req: AIRequest) -> AIReply:
    ensure_llm(ctx)
    slug = req.company or (req.companies[0] if req.companies else "") or None
    company = await ctx.store.get_company(slug) if slug else None
    peers = await ctx.store.get_peer_group(slug, 6) if slug else []
    spec = _detect(req.question)
    fallback = _ratio_fallback(company, spec, peers)
    return await grounded(ctx, req.question, SYSTEM, company=slug, limit=6, fallback=fallback)