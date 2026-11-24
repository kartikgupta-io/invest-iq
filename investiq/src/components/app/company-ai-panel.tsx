"use client";

import { useMemo, useState } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BrowserAiPanel } from "@/components/app/browser-ai-panel";
import { useNews, useSemanticSearch } from "@/lib/data";
import type { GroundedCitation } from "@/lib/browser-ai";
import type { AnnualFinancials, PeerCompany, TickerQuote } from "@/lib/types";
import { formatLargeNumber, formatNumber, formatOrDash, formatPercent } from "@/lib/utils";

const SUGGESTIONS = [
  "What drove revenue growth in the latest year?",
  "How do profitability and returns compare with peers?",
  "Summarise the latest announcements and news.",
];

type Props = {
  slug: string;
  name: string;
  ticker: string;
  annual: AnnualFinancials[];
  quote: TickerQuote;
  peers: PeerCompany[];
};

/** Grounded assistant scoped to the company currently being researched. */
export function CompanyAiPanel({ slug, name, ticker, annual, quote, peers }: Props) {
  const [draft, setDraft] = useState("");
  const [question, setQuestion] = useState("");

  const hits = useSemanticSearch(question, slug);
  const news = useNews(question || name, ticker);

  const citations = useMemo<GroundedCitation[]>(() => {
    const latest = annual[annual.length - 1];
    const list: GroundedCitation[] = [];
    const num = (value: number | null, formatter: (n: number) => string) =>
      formatOrDash(value, formatter);

    if (latest) {
      const facts = [
        `Fiscal year ${latest.year}`,
        `Revenue ${num(latest.revenue, formatLargeNumber)}`,
        `Revenue growth ${num(latest.revenueGrowth, formatPercent)}`,
        `Net profit ${num(latest.netIncome, formatLargeNumber)}`,
        `EPS ${num(latest.eps, formatNumber)}`,
        `Net margin ${num(latest.netMargin, formatPercent)}`,
        `ROE ${num(latest.roe, formatPercent)}`,
        `ROCE ${num(latest.roce, formatPercent)}`,
        `Debt to equity ${num(latest.debtToEquity, formatNumber)}`,
        `Operating cash flow ${num(latest.operatingCashFlow, formatLargeNumber)}`,
      ].filter((part) => !part.endsWith("—"));
      list.push({
        documentTitle: `${name} — reported annual financials`,
        section: `${latest.year} · Screener.in consolidated statements`,
        page: 0,
        text: facts.join(" · "),
        source: "Screener.in / issuer filings",
        url: `https://www.screener.in/company/${encodeURIComponent(ticker.replace(/\.NS$/, ""))}/consolidated/`,
      });
    }

    list.push({
      documentTitle: `${name} — live market snapshot`,
      section: "Latest quote",
      page: 0,
      text: [
        `Price ${num(quote.price, formatNumber)}`,
        `Day change ${num(quote.changePct, formatPercent)}`,
        `Market cap ${num(quote.marketCap, formatLargeNumber)} crore`,
        `P/E ${num(quote.peRatio, formatNumber)}`,
        `52-week range ${num(quote.low52Week, formatNumber)} to ${num(quote.high52Week, formatNumber)}`,
      ].join(" · "),
      source: "Yahoo Finance",
      url: `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/`,
    });

    const comparable = peers.slice(0, 5).map((peer) =>
      `${peer.name}: P/E ${num(peer.peRatio, formatNumber)}, ROE ${num(peer.roe, formatPercent)}, market cap ${num(peer.marketCap, formatLargeNumber)} crore`,
    );
    if (comparable.length) {
      list.push({
        documentTitle: `${name} — comparable companies`,
        section: "Peer metrics",
        page: 0,
        text: comparable.join(" · "),
        source: "Screener.in / Yahoo Finance",
        url: `https://www.screener.in/company/${encodeURIComponent(ticker.replace(/\.NS$/, ""))}/consolidated/`,
      });
    }

    for (const hit of hits.data ?? []) {
      list.push({
        documentTitle: hit.section || "Filing excerpt",
        section: `${hit.kind === "news" ? "News" : "Filing"} · ${hit.source ?? "source"}`,
        page: hit.page,
        text: hit.text,
        url: hit.url,
        source: hit.source,
      });
    }
    for (const item of news.data ?? []) {
      list.push({
        documentTitle: item.section || item.text.slice(0, 80),
        section: `News · ${item.source ?? "publisher"}`,
        page: 0,
        text: item.text,
        url: item.url,
        source: item.source,
      });
    }
    return list;
  }, [annual, hits.data, name, news.data, peers, quote, ticker]);

  const submit = (text: string) => {
    const value = text.trim();
    if (!value) return;
    setQuestion(value);
    setDraft(value);
  };

  return (
    <Card id="company-ai" className="border-primary/30 bg-gradient-to-br from-primary/[0.06] to-transparent">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> Ask AI about {name}
        </CardTitle>
        <CardDescription>
          Answers are generated on your device from retrieved filings, news and the sourced figures on this page.
          Every claim links back to its source.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            submit(draft);
          }}
        >
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`Ask anything about ${ticker}…`}
            aria-label={`Ask AI about ${name}`}
          />
          <Button type="submit" className="shrink-0">
            Ask <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </form>

        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => submit(suggestion)}
              className="rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {suggestion}
            </button>
          ))}
        </div>

        {question ? (
          <div className="space-y-3 border-t border-border/60 pt-4">
            <BrowserAiPanel question={`${name} (${ticker}): ${question}`} citations={citations} />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {citations.length} sourced snippets are ready. Ask a question to generate a cited answer.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
