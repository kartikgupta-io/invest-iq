"""Standalone report generation.

Renders an interactive single-file HTML report and a PDF report for a single
company. The narrative comes from the ``summarize-*`` module when available and
otherwise from a deterministic builder over the stored data — never 500s.
"""

from __future__ import annotations

import html
import io
import re
from datetime import datetime, timezone

from app.ai.base import AIContext, AIReply, AIRequest
from app.ai.llm import get_llm
from app.ai.memory import get_memory
from app.ai.metrics import build_metrics, investment_score, parse_year, rating_for
from app.data.contract import Citation, Company, DataStore

_SVG_WIDTH = 760
_SVG_HEIGHT = 280
_PAD = 42


def _cr(value: float) -> str:
    if abs(value) >= 1e7:
        return f"{value / 1e7:,.2f} Cr"
    if abs(value) >= 1e5:
        return f"{value / 1e5:,.2f} L"
    return f"{value:,.0f}"


def _doc_citations(company: Company) -> list[Citation]:
    return [
        Citation(
            id=doc.id,
            documentId=doc.id,
            title=doc.title,
            source=doc.source,
            page=1,
            snippet=doc.title,
            score=1.0,
        )
        for doc in (company.documents or [])[:4]
    ]


def _deterministic_summary(company: Company) -> AIReply:
    metrics = build_metrics(company)
    latest = metrics.trend[-1] if metrics.trend else None
    period = f"FY{parse_year(latest.year)}" if latest else "latest"
    citations = _doc_citations(company)
    lines = [
        f"# {metrics.name} — {period} Summary",
        "",
        f"**{metrics.name} ({metrics.ticker})** operates in the **{metrics.sector}** sector. This is a "
        "deterministic summary derived from the stored filings.",
        "",
        "## Key financials",
        f"- Revenue **{_cr(metrics.revenue)}** in {period}, growing **{metrics.revenue_growth:+.1f}%** YoY.",
        f"- Net margin **{metrics.net_margin:.1f}%**; operating margin **{metrics.operating_margin:.1f}%**; "
        f"gross margin **{metrics.gross_margin:.1f}%**.",
        f"- ROE **{metrics.roe:.1f}%**; ROCE **{metrics.roce:.1f}%**; EPS **{metrics.eps:.2f}**.",
        "",
        "## Cash flow & balance sheet",
        f"- Operating cash flow **{_cr(metrics.operating_cash_flow)}**; free cash flow "
        f"**{_cr(metrics.free_cash_flow)}** ({metrics.fcf_margin:.1f}% of revenue).",
        f"- Net debt/equity **{metrics.debt_to_equity:.2f}x**; interest cover **{metrics.interest_cover:.1f}x**; "
        f"current ratio **{metrics.current_ratio:.2f}**.",
        "",
        "## Valuation",
        f"- P/E **{metrics.pe:.1f}**; P/B **{metrics.pb:.1f}**; EV/EBITDA **{metrics.ev_ebitda:.1f}**; "
        f"dividend yield **{metrics.dividend_yield:.2f}%**.",
        "",
        "_Offline mode: no live-model reasoning; every figure maps to the cited filings in the store._",
    ]
    return AIReply(answer="\n".join(lines), citations=citations, mode="fallback")


async def _module_reply(store: DataStore, company: Company, symbol: str, module_name: str) -> AIReply:
    try:
        from app.ai import modules as ai_modules

        modules = getattr(ai_modules, "MODULES", None) or {}
    except Exception:
        modules = {}
    fn = modules.get(module_name)
    if fn is not None:
        try:
            ctx = AIContext(store=store, llm=get_llm(), memory=get_memory())
            request = AIRequest(
                question=f"Summarize the {module_name} report for {company.profile.name}.",
                company=symbol,
                companies=[symbol],
                stream=False,
            )
            reply = await fn(ctx, request)
            if reply is not None and reply.answer and reply.answer.strip():
                return reply
        except Exception:
            pass
    return _deterministic_summary(company)


def _inline(s: str) -> str:
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', s)
    return s


def _md_to_html(markdown: str) -> str:
    """Tiny markdown->HTML: headers, bullets, bold, links. No external lib."""
    out: list[str] = []
    in_list = False
    for raw in markdown.splitlines():
        line = html.escape(raw)
        if line.startswith("### "):
            if in_list:
                out.append("</ul>")
                in_list = False
            out.append(f"<h3>{_inline(line[4:])}</h3>")
        elif line.startswith("## "):
            if in_list:
                out.append("</ul>")
                in_list = False
            out.append(f"<h2>{_inline(line[3:])}</h2>")
        elif line.startswith("# "):
            if in_list:
                out.append("</ul>")
                in_list = False
            out.append(f"<h1>{_inline(line[2:])}</h1>")
        elif re.match(r"^\s*[-*] ", line):
            if not in_list:
                out.append("<ul>")
                in_list = True
            item = re.sub(r"^\s*[-*] ", "", line)
            out.append(f"<li>{_inline(item)}</li>")
        elif line.strip() == "":
            if in_list:
                out.append("</ul>")
                in_list = False
            out.append("")
        else:
            if in_list:
                out.append("</ul>")
                in_list = False
            out.append(f"<p>{_inline(line)}</p>")
    if in_list:
        out.append("</ul>")
    return "\n".join(out)


def _polyline(values: list[float], count: int, max_value: float, color: str) -> str:
    if max_value <= 0:
        max_value = 1.0
    usable_w = _SVG_WIDTH - 2 * _PAD
    usable_h = _SVG_HEIGHT - 2 * _PAD
    points: list[str] = []
    for index, value in enumerate(values):
        x = _PAD + index * (usable_w / max(count - 1, 1))
        y = _SVG_HEIGHT - _PAD - (value / max_value) * usable_h
        points.append(f"{x:.1f},{y:.1f}")
    return f'<polyline points="{" ".join(points)}" fill="none" stroke="{color}" stroke-width="2"/>'


def _x_axis_labels(labels: list[str]) -> str:
    usable_w = _SVG_WIDTH - 2 * _PAD
    parts: list[str] = []
    for index, label in enumerate(labels):
        x = _PAD + index * (usable_w / max(len(labels) - 1, 1))
        parts.append(f'<text x="{x:.1f}" y="{_SVG_HEIGHT - 12:.0f}" text-anchor="middle" font-size="11" fill="#64748b">{html.escape(str(label))}</text>')
    return "\n".join(parts)


def _line_chart_svg(years: list[str], revenue: list[float], net_income: list[float]) -> str:
    peak = max([abs(v) for v in revenue + net_income] + [1.0])
    body = "\n".join(
        [
            _polyline(revenue, len(years), peak, "#2563eb"),
            _polyline(net_income, len(years), peak, "#16a34a"),
            _x_axis_labels(years),
            '<text x="12" y="20" font-size="12" fill="#64748b">Revenue</text>',
            '<text x="12" y="38" font-size="12" fill="#16a34a">Net income</text>',
        ]
    )
    return (
        f'<svg viewBox="0 0 {_SVG_WIDTH} {_SVG_HEIGHT}" width="100%" height="auto" '
        f'role="img" aria-label="Revenue and net income trend">'
        f'<rect x="0" y="0" width="{_SVG_WIDTH}" height="{_SVG_HEIGHT}" fill="#f8fafc" rx="8"/>'
        f"{body}</svg>"
    )


def _bar_chart_svg(labels: list[str], values: list[float]) -> str:
    if not values:
        return "<p>No margin data available.</p>"
    usable_w = _SVG_WIDTH - 2 * _PAD
    usable_h = _SVG_HEIGHT - 2 * _PAD
    max_value = max([abs(v) for v in values] + [1.0])
    bar_width = usable_w / max(len(values), 1) * 0.55
    parts: list[str] = []
    for index, (label, value) in enumerate(zip(labels, values)):
        x = _PAD + index * (usable_w / max(len(values), 1)) + bar_width * 0.2
        height = abs(value) / max_value * usable_h
        y = _SVG_HEIGHT - _PAD - height
        color = "#f59e0b" if value >= 0 else "#ef4444"
        parts.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{bar_width:.1f}" height="{height:.1f}" rx="3" fill="{color}"/>')
        parts.append(f'<text x="{x + bar_width / 2:.1f}" y="{max(y - 6, 14):.1f}" text-anchor="middle" font-size="10" fill="#334155">{value:.1f}</text>')
    body = "\n".join(parts + [_x_axis_labels(labels)])
    return (
        f'<svg viewBox="0 0 {_SVG_WIDTH} {_SVG_HEIGHT}" width="100%" height="auto" '
        f'role="img" aria-label="Net margin by year">'
        f'<rect x="0" y="0" width="{_SVG_WIDTH}" height="{_SVG_HEIGHT}" fill="#f8fafc" rx="8"/>'
        f"{body}</svg>"
    )


def _score_card_html(company: Company) -> str:
    metrics = build_metrics(company)
    score = investment_score(metrics)
    rating = rating_for(score)
    subs = " ".join(f'<div class="sub"><span>{html.escape(k)}</span><strong>{v:.0f}</strong></div>' for k, v in metrics_sub_scores(metrics).items())
    return (
        f'<div class="score-card"><div class="score-ring">{score:.0f}</div>'
        f'<div class="score-info"><div class="rating">{html.escape(rating)}</div>'
        f'<div class="subs">{subs}</div></div></div>'
    )


def metrics_sub_scores(metrics) -> dict[str, float]:
    from app.ai.metrics import sub_scores

    return sub_scores(metrics)


def _citation_html(citation: Citation) -> str:
    return (
        f'<li class="citation"><strong>{html.escape(citation.title)}</strong>'
        f'<span class="cite-meta">{html.escape(citation.source)} · p.{citation.page}</span>'
        f'<p class="snippet">{html.escape(citation.snippet)}</p></li>'
    )


def _error_html(symbol: str) -> str:
    return (
        f"<!doctype html><html><head><meta charset=\"utf-8\"><title>Report — {html.escape(symbol)}</title></head>"
        f"<body><h1>Company not found</h1><p>No data is available for <code>{html.escape(symbol)}</code>.</p></body></html>"
    )


async def interactive_report(
    store: DataStore,
    symbol: str,
    module: str = "annual",
    lang: str = "markdown",
) -> str:
    """Render a self-contained HTML report for ``symbol``."""
    company = await store.get_company(symbol)
    if company is None:
        return _error_html(symbol)
    profile = company.profile
    reply = await _module_reply(store, company, symbol, f"summarize-{module}")
    metrics = build_metrics(company)

    years = [a.year for a in sorted(company.annual, key=lambda a: parse_year(a.year))]
    revenue = [a.revenue for a in sorted(company.annual, key=lambda a: parse_year(a.year))]
    net_income = [a.netIncome for a in sorted(company.annual, key=lambda a: parse_year(a.year))]
    net_margin = [a.netMargin * 100 for a in sorted(company.annual, key=lambda a: parse_year(a.year))]

    citations_html = "\n".join(_citation_html(c) for c in reply.citations) or "<p>No citations attached.</p>"
    answer_html = _md_to_html(reply.answer)
    generated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>InvestIQ Report — {html.escape(profile.name)}</title>
<style>
  :root {{ color-scheme: light; }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #0f172a; background: #eef2f7; }}
  header {{ background: linear-gradient(135deg, #1e3a8a, #2563eb); color: #fff; padding: 28px 40px; }}
  header h1 {{ margin: 0 0 4px; font-size: 26px; }}
  header .meta {{ opacity: .9; font-size: 13px; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 18px; padding: 24px 40px; }}
  .card {{ background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(15,23,42,.08); }}
  .card h2 {{ margin: 0 0 12px; font-size: 16px; color: #1e3a8a; }}
  .score-card {{ display: flex; gap: 18px; align-items: center; }}
  .score-ring {{ width: 84px; height: 84px; border-radius: 50%; background: conic-gradient(#16a34a 0deg 0deg, #e2e8f0 0deg); display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 700; color: #16a34a; border: 4px solid #bbf7d0; }}
  .rating {{ font-size: 20px; font-weight: 700; }}
  .subs {{ display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }}
  .sub {{ background: #f1f5f9; border-radius: 6px; padding: 4px 8px; font-size: 11px; color: #475569; }}
  .sub strong {{ display: block; color: #0f172a; font-size: 13px; }}
  .answer h1, .answer h2, .answer h3 {{ margin: 14px 0 6px; }}
  .answer ul {{ padding-left: 20px; }}
  .answer p {{ margin: 6px 0; line-height: 1.55; }}
  .citation {{ border-top: 1px solid #e2e8f0; padding: 10px 0; list-style: none; }}
  .citation a {{ color: #2563eb; font-weight: 600; text-decoration: none; }}
  .cite-meta {{ display: block; color: #64748b; font-size: 12px; }}
  .snippet {{ margin: 4px 0 0; color: #334155; font-size: 13px; }}
  footer {{ padding: 18px 40px; color: #64748b; font-size: 12px; }}
</style>
</head>
<body>
<header>
  <h1>{html.escape(profile.name)} <span style="font-weight:400;font-size:16px;">({html.escape(profile.ticker)} · {html.escape(profile.exchange)})</span></h1>
  <div class="meta">{html.escape(profile.sector)} · {html.escape(profile.industry)} · HQ {html.escape(profile.headquarters)} · Founded {profile.founded} · {profile.employees:,} employees · Generated {generated}</div>
</header>
<div class="grid">
  <section class="card"><h2>Investment score</h2>{_score_card_html(company)}</section>
  <section class="card"><h2>Revenue &amp; net income trend</h2>{_line_chart_svg(years, revenue, net_income)}</section>
  <section class="card"><h2>Net margin (%)</h2>{_bar_chart_svg(years, net_margin)}</section>
  <section class="card answer"><h2>Narrative</h2>{answer_html}</section>
  <section class="card"><h2>Supporting citations</h2><ul style="margin:0;padding:0;">{citations_html}</ul></section>
</div>
<footer>Generated by InvestIQ ({reply.mode} mode). The narrative is grounded in the cited filings.</footer>
</body>
</html>"""


def _render_pdf(company: Company, reply: AIReply) -> bytes:
    """Build the PDF with reportlab into an in-memory buffer."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    profile = company.profile
    annual = sorted(company.annual, key=lambda a: parse_year(a.year))
    styles = getSampleStyleSheet()

    story = [Paragraph(f"InvestIQ Report — {profile.name} ({profile.ticker})", styles["Title"]), Spacer(1, 4 * mm)]
    meta_style = ParagraphStyle("Meta", parent=styles["BodyText"], fontSize=8.5, textColor=colors.HexColor("#475569"))
    story.append(
        Paragraph(
            f"{profile.sector} · {profile.industry} · HQ {profile.headquarters} · Founded {profile.founded} · "
            f"Employees {profile.employees:,}",
            meta_style,
        )
    )
    story.append(Spacer(1, 4 * mm))

    metrics = ["Revenue", "Net income", "Operating income", "Net margin (%)", "ROE (%)", "Operating cash flow"]
    header = ["Metric"] + [f"FY{parse_year(a.year)}" for a in annual]
    rows = [header]
    year_labels = [a.year for a in annual]
    by_year = {a.year: a for a in annual}
    value_rows = {
        "Revenue": lambda a: _cr(a.revenue),
        "Net income": lambda a: _cr(a.netIncome),
        "Operating income": lambda a: _cr(a.operatingIncome),
        "Net margin (%)": lambda a: f"{a.netMargin:.1f}",
        "ROE (%)": lambda a: f"{a.roe:.1f}",
        "Operating cash flow": lambda a: _cr(a.operatingCashFlow),
    }
    for metric in metrics:
        row = [metric]
        for year in year_labels:
            record = by_year.get(year)
            row.append(value_rows[metric](record) if record is not None else "—")
        rows.append(row)

    table = Table(rows, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a8a")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
            ]
        )
    )
    story.append(table)
    story.append(Spacer(1, 6 * mm))

    story.append(Paragraph("Narrative", styles["Heading2"]))
    text = re.sub(r"[#*_`>]", "", reply.answer)
    text = re.sub(r"\[(.*?)\]\((.*?)\)", r"\1", text)
    for paragraph in text.split("\n"):
        paragraph = paragraph.strip()
        if paragraph:
            story.append(Paragraph(paragraph, styles["BodyText"]))
    story.append(Spacer(1, 6 * mm))

    story.append(Paragraph("Supporting citations", styles["Heading2"]))
    for i, citation in enumerate(reply.citations, start=1):
        story.append(
            Paragraph(f"{i}. {citation.title} — {citation.source}, p.{citation.page}", styles["BodyText"])
        )
        if citation.snippet:
            story.append(Paragraph(citation.snippet[:220], styles["Italic"]))

    buffer = io.BytesIO()
    document = SimpleDocTemplate(buffer, pagesize=A4, title=f"{profile.name} Report")
    document.build(story)
    return buffer.getvalue()


async def pdf_report(store: DataStore, symbol: str) -> bytes:
    """Generate a PDF report for ``symbol``, falling back to the HTML report."""
    company = await store.get_company(symbol)
    if company is None:
        return _error_html(symbol).encode("utf-8")
    reply = await _module_reply(store, company, symbol, "summarize-annual")
    try:
        return _render_pdf(company, reply)
    except ImportError:
        return (await interactive_report(store, symbol)).encode("utf-8")