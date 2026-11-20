import type { AnnualFinancials, Company, ValuationPoint } from "@/lib/types";
import type { EChartsCoreOption } from "echarts/core";

export type MetricKey =
  | "revenue"
  | "profit"
  | "margins"
  | "cashflow"
  | "debt"
  | "roe"
  | "roce"
  | "eps"
  | "valuation"
  | "market-cap";

type Row = AnnualFinancials & Partial<ValuationPoint>;

interface SeriesDef {
  key: string;
  label: string;
  kind: "bar" | "line";
  color: string;
  percent?: boolean;
  format: (n: number | null | undefined) => string;
}

interface StatDef {
  label: string;
  accessor: (r: Row) => number | null | undefined;
  format: (n: number | null | undefined) => string;
}

interface TableCol {
  label: string;
  accessor: (r: Row) => string | number;
}

export interface MetricView {
  meta: { title: string; description: string; symbol: string };
  years: string[];
  rows: Row[];
  series: SeriesDef[];
  stats: StatDef[];
  table: TableCol[];
  option: EChartsCoreOption;
}

const dash = (n: number | null | undefined): n is number => n != null && Number.isFinite(n);
const fmtCr = (n: number | null | undefined) => (dash(n) ? `${n.toLocaleString("en-IN")} Cr` : "—");
const fmtPct = (n: number | null | undefined) => (dash(n) ? `${n.toFixed(2)}%` : "—");
const fmtNum = (n: number | null | undefined) => (dash(n) ? `${n.toFixed(2)}` : "—");
const fmtX = (n: number | null | undefined) => (dash(n) ? `${n.toFixed(2)}x` : "—");
const fmtNum0 = (n: number | null | undefined) =>
  dash(n) ? n.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—";

const PALETTE = ["#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#f43f5e", "#6366f1"];

const LABELS: Record<string, string> = {
  revenue: "Revenue",
  revenueGrowth: "YoY Growth",
  grossProfit: "Gross Profit",
  netIncome: "Net Income",
  netMargin: "Net Margin",
  operatingCashFlow: "Operating CF",
  investingCashFlow: "Investing CF",
  freeCashFlow: "Free CF",
  totalDebt: "Total Debt",
  netDebt: "Net Debt",
  debtToEquity: "Debt/Equity",
  grossMargin: "Gross Margin",
  operatingMargin: "Operating Margin",
  roe: "ROE",
  roce: "ROCE",
  eps: "EPS",
  dividendPerShare: "DPS",
  dividendYield: "Div. Yield",
  peRatio: "P/E",
  evToEbitda: "EV/EBITDA",
  priceToBook: "P/B",
  marketCap: "Market Cap",
};

const stat = (
  label: string,
  accessor: (r: Row) => number | null | undefined,
  format: (n: number | null | undefined) => string,
): StatDef => ({ label, accessor, format });

const META: Record<MetricKey, { title: string; description: string; symbol: string }> = {
  revenue: { title: "Revenue", description: "Total annual turnover with year-on-year growth.", symbol: "₹" },
  profit: { title: "Profit", description: "Gross profit, net income and net margin.", symbol: "₹" },
  margins: { title: "Margins", description: "Gross, operating and net profitability as a share of revenue.", symbol: "%" },
  cashflow: { title: "Cash Flow", description: "Operating, investing and free cash flow.", symbol: "₹" },
  debt: { title: "Debt", description: "Total and net debt with leverage and interest coverage.", symbol: "₹" },
  roe: { title: "Return on Equity", description: "Net income divided by shareholders' equity.", symbol: "%" },
  roce: { title: "Return on Capital Employed", description: "Operating profit relative to capital employed.", symbol: "%" },
  eps: { title: "Earnings Per Share", description: "Net income per share with dividends.", symbol: "₹" },
  valuation: { title: "Valuation", description: "P/E, EV/EBITDA and dividend yield.", symbol: "x" },
  "market-cap": { title: "Market Capitalisation", description: "Total market value of the company.", symbol: "₹" },
};

const BAR_KEYS: Partial<Record<MetricKey, string[]>> = {
  revenue: ["revenue"],
  profit: ["grossProfit", "netIncome"],
  cashflow: ["operatingCashFlow", "investingCashFlow"],
  debt: ["totalDebt", "netDebt"],
  "market-cap": ["marketCap"],
};

function serialize(
  key: MetricKey,
  k: string,
  format: (n: number | null | undefined) => string,
  percent = false,
): SeriesDef {
  return {
    key: k,
    label: LABELS[k] ?? k,
    kind: BAR_KEYS[key]?.includes(k) ? "bar" : "line",
    color: PALETTE[0],
    percent,
    format,
  };
}

export function buildMetricView(key: MetricKey, company: Company): MetricView {
  const ann = company.annual;
  const rows: Row[] = ann.map((a, i) => ({ ...a, ...(company.valuation[i] ?? {}) }));
  const years = ann.map((a) => a.year.slice(2));
  const meta = META[key];

  let series: SeriesDef[] = [];
  let stats: StatDef[] = [];

  switch (key) {
    case "revenue":
      series = [serialize(key, "revenue", fmtCr), serialize(key, "revenueGrowth", fmtPct, true)];
      stats = [stat("FY2026 Revenue", (r) => r.revenue, fmtCr), stat("YoY Growth", (r) => r.revenueGrowth, fmtPct), stat("Revenue / Share", (r) => r.revenuePerShare, fmtNum0)];
      break;
    case "profit":
      series = [serialize(key, "grossProfit", fmtCr), serialize(key, "netIncome", fmtCr), serialize(key, "netMargin", fmtPct, true)];
      stats = [stat("Net Income", (r) => r.netIncome, fmtCr), stat("Net Margin", (r) => r.netMargin, fmtPct), stat("EPS", (r) => r.eps, fmtNum)];
      break;
    case "margins":
      series = [serialize(key, "grossMargin", fmtPct, true), serialize(key, "operatingMargin", fmtPct, true), serialize(key, "netMargin", fmtPct, true)];
      stats = [stat("Gross", (r) => r.grossMargin, fmtPct), stat("Operating", (r) => r.operatingMargin, fmtPct), stat("Net", (r) => r.netMargin, fmtPct)];
      break;
    case "cashflow":
      series = [serialize(key, "operatingCashFlow", fmtCr), serialize(key, "investingCashFlow", fmtCr), serialize(key, "freeCashFlow", fmtCr)];
      stats = [stat("Operating CF", (r) => r.operatingCashFlow, fmtCr), stat("Free CF", (r) => r.freeCashFlow, fmtCr), stat("FCF / Net Income", (r) => (dash(r.freeCashFlow) && dash(r.netIncome) ? (r.freeCashFlow / Math.max(r.netIncome, 1)) * 100 : null), fmtPct)];
      break;
    case "debt":
      series = [serialize(key, "totalDebt", fmtCr), serialize(key, "netDebt", fmtCr), serialize(key, "debtToEquity", fmtX, true)];
      stats = [stat("Total Debt", (r) => r.totalDebt, fmtCr), stat("Net Debt", (r) => r.netDebt, fmtCr), stat("Debt / Equity", (r) => r.debtToEquity, fmtX), stat("Interest Cover", (r) => r.interestCover, fmtX)];
      break;
    case "roe":
      series = [serialize(key, "roe", fmtPct)];
      stats = [stat("Return on Equity", (r) => r.roe, fmtPct), stat("Net Margin", (r) => r.netMargin, fmtPct), stat("Leverage", (r) => (dash(r.totalAssets) && dash(r.totalEquity) ? r.totalAssets / Math.max(r.totalEquity, 1) : null), fmtX)];
      break;
    case "roce":
      series = [serialize(key, "roce", fmtPct)];
      stats = [stat("ROCE", (r) => r.roce, fmtPct), stat("Operating Margin", (r) => r.operatingMargin, fmtPct)];
      break;
    case "eps":
      series = [serialize(key, "eps", fmtNum), serialize(key, "dividendPerShare", fmtNum)];
      stats = [stat("EPS", (r) => r.eps, fmtNum), stat("DPS", (r) => r.dividendPerShare, fmtNum), stat("Dividend Yield", (r) => r.dividendYield, fmtPct)];
      break;
    case "valuation":
      series = [serialize(key, "peRatio", fmtNum), serialize(key, "evToEbitda", fmtNum), serialize(key, "dividendYield", fmtPct, true)];
      stats = [stat("P/E", (r) => r.peRatio, fmtNum), stat("EV/EBITDA", (r) => r.evToEbitda, fmtNum), stat("P/B", (r) => r.priceToBook, fmtNum), stat("Dividend Yield", (r) => r.dividendYield, fmtPct)];
      break;
    case "market-cap":
      series = [serialize(key, "marketCap", fmtCr)];
      stats = [stat("Market Cap", (r) => r.marketCap, fmtCr), stat("P/E", (r) => r.peRatio, fmtNum), stat("Dividend Yield", (r) => r.dividendYield, fmtPct)];
      break;
  }

  series = series.map((s, i) => ({ ...s, color: PALETTE[i % PALETTE.length] }));
  const table = buildTable(key, years, rows);
  const option = buildOption(years, series, rows);

  return { meta, years, rows, series, stats, table, option };
}

function buildOption(
  years: string[],
  series: SeriesDef[],
  rows: Row[] = [],
): EChartsCoreOption {
  return {
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(10,10,20,0.92)",
      borderWidth: 0,
      textStyle: { color: "#fff", fontSize: 12 },
      valueFormatter: (v: unknown) => String(v),
    },
    legend: { top: 0, right: 0, icon: "circle", itemWidth: 8, itemHeight: 8, textStyle: { color: "#94a3b8" } },
    grid: { left: 8, right: 16, top: 44, bottom: 8, containLabel: true },
    xAxis: { type: "category", data: years, boundaryGap: true, axisLine: { lineStyle: { color: "rgba(148,163,184,0.25)" } }, axisTick: { show: false }, axisLabel: { color: "#94a3b8" } },
    yAxis: axisDef(),
    series: series.map((s) => ({
      name: s.label,
      type: s.kind,
      data: rows.map((r) => (r[s.key as keyof Row] as number | null | undefined) ?? null),
      itemStyle: { color: s.color, borderRadius: s.kind === "bar" ? [4, 4, 0, 0] : 0 },
      lineStyle: { color: s.color, width: 2 },
      smooth: true,
      emphasis: { focus: "series" },
    })),
  };
}

function axisDef() {
  return { type: "value", splitLine: { lineStyle: { color: "rgba(148,163,184,0.12)" } }, axisLabel: { color: "#94a3b8" } };
}

function buildTable(key: MetricKey, years: string[], rows: Row[]): TableCol[] {
  const cols: TableCol[] = [];
  if (["revenue", "profit", "cashflow", "debt", "market-cap"].includes(key)) {
    const keys =
      key === "revenue" ? ["revenue", "revenueGrowth"]
      : key === "profit" ? ["grossProfit", "netIncome", "netMargin"]
      : key === "cashflow" ? ["operatingCashFlow", "freeCashFlow"]
      : key === "debt" ? ["totalDebt", "netDebt", "debtToEquity"]
      : ["marketCap"];
    for (const k of keys) {
      cols.push({ label: LABELS[k] ?? k, accessor: (r) => fmtByKey(k, r) });
    }
  } else if (["margins", "roe", "roce"].includes(key)) {
    const keys = key === "margins" ? ["grossMargin", "operatingMargin", "netMargin"] : [key];
    for (const k of keys) cols.push({ label: LABELS[k] ?? k, accessor: (r) => fmtByKey(k, r) });
  } else if (key === "eps") {
    cols.push({ label: "EPS", accessor: (r) => fmtNum(r.eps) }, { label: "DPS", accessor: (r) => fmtNum(r.dividendPerShare) }, { label: "Yield", accessor: (r) => fmtPct(r.dividendYield) });
  } else if (key === "valuation") {
    cols.push({ label: "P/E", accessor: (r) => fmtNum(r.peRatio) }, { label: "EV/EBITDA", accessor: (r) => fmtNum(r.evToEbitda) }, { label: "P/B", accessor: (r) => fmtNum(r.priceToBook) }, { label: "Yield", accessor: (r) => fmtPct(r.dividendYield) });
  }
  return cols;
}

function fmtByKey(k: string, r: Row): string | number {
  const v = (r as unknown as Record<string, unknown>)[k];
  if (typeof v === "number") {
    if (k === "revenueGrowth" || k === "netMargin" || k === "grossMargin" || k === "operatingMargin") return fmtPct(v);
    if (k === "debtToEquity") return fmtX(v);
    return fmtCr(v);
  }
  return v === undefined || v === null ? "—" : String(v);
}