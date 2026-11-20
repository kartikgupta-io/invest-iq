"""AI engine request/response models."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.data.contract import AnnualFinancials, Citation, PeerCompany


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    session_id: str | None = None
    messages: list[ChatMessage] = Field(min_length=1)
    company: str | None = None
    stream: bool = True


class ChatResponse(BaseModel):
    session: str
    response: str
    citations: list[Citation] = Field(default_factory=list)


class CompareRequest(BaseModel):
    symbols: list[str] = Field(min_length=2, max_length=6)


class RatioRequest(BaseModel):
    slug: str
    metric: str | None = None


class ScoreResponse(BaseModel):
    slug: str
    name: str
    ticker: str
    score: float
    rating: str
    sub_scores: dict[str, float]
    key_metrics: dict[str, float]
    summary: str
    citations: list[Citation] = Field(default_factory=list)


class AnalysisSection(BaseModel):
    title: str
    points: list[str] = Field(default_factory=list)


class RiskItem(BaseModel):
    severity: Literal["low", "medium", "high"]
    title: str
    description: str
    evidence: str
    citations: list[Citation] = Field(default_factory=list)


class RiskResponse(BaseModel):
    slug: str
    name: str
    risks: list[RiskItem] = Field(default_factory=list)
    overall: str
    citations: list[Citation] = Field(default_factory=list)


class MetricRow(BaseModel):
    metric: str
    values: list[float]
    companyIndex: int = 0
    bestIs: Literal["high", "low"] = "high"


class ChartSpec(BaseModel):
    type: Literal["bar", "line", "radar"]
    title: str
    labels: list[str] = Field(default_factory=list)
    series: list[dict] = Field(default_factory=list)


class ComparisonResponse(BaseModel):
    symbols: list[str]
    names: list[str]
    rows: list[MetricRow] = Field(default_factory=list)
    charts: list[ChartSpec] = Field(default_factory=list)
    narrative: str
    citations: list[Citation] = Field(default_factory=list)


class SummaryResponse(BaseModel):
    documentId: str
    title: str
    type: str
    sections: list[AnalysisSection] = Field(default_factory=list)
    keyMetrics: list[AnnualFinancials] = Field(default_factory=list)
    citations: list[Citation] = Field(default_factory=list)


class ValuationResponse(BaseModel):
    slug: str
    name: str
    fairValueRange: list[float]
    currentPrice: float
    signal: str
    explanation: str
    citations: list[Citation] = Field(default_factory=list)


class RatioExplanation(BaseModel):
    metric: str
    label: str
    value: float
    peerMedian: float
    howToRead: str
    interpretation: str
    citations: list[Citation] = Field(default_factory=list)


class CompetitiveResponse(BaseModel):
    slug: str
    name: str
    position: str
    moat: str
    peers: list[PeerCompany] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    radar: ChartSpec | None = None
    citations: list[Citation] = Field(default_factory=list)


class ReportSection(BaseModel):
    title: str
    markdown: str = ""
    tables: list[list[list[str]]] = Field(default_factory=list)
    charts: list[ChartSpec] = Field(default_factory=list)


class Report(BaseModel):
    slug: str
    title: str
    subtitle: str
    generatedAt: str
    sections: list[ReportSection] = Field(default_factory=list)
    citations: list[Citation] = Field(default_factory=list)
