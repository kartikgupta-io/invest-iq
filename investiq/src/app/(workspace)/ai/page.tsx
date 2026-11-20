"use client";

import { useMemo, useState } from "react";
import { Sparkles, FileText, ExternalLink, Database, Search as SearchIcon } from "lucide-react";
import { useDocuments, useSemanticSearch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/loader";
import { EmptyState } from "@/components/ui/empty-state";

const PIPELINE_STEPS = [
  { title: "Ingestion", body: "Filings are pulled from SEC EDGAR, NSE, BSE, and official IR sites, then versioned with content hashes." },
  { title: "Chunking & embedding", body: "Documents are split into citation-sized sections and embedded into a vector index." },
  { title: "Semantic retrieval", body: "Your query is mapped to the most relevant excerpts by embedding similarity." },
  { title: "Cited answers", body: "Results return with document, page, section, and a relevance score so every claim is verifiable." },
];

export default function AiResearchPage() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");

  const { data: results, isLoading, isError } = useSemanticSearch(submitted);
  const { data: documents } = useDocuments("reliance");

  const docTitle = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of documents ?? []) map.set(d.id, d.title);
    return map;
  }, [documents]);

  const runSearch = () => {
    const q = query.trim();
    if (q.length < 3) return;
    setSubmitted(q);
  };

  const hasResults = submitted.length > 2 && results && results.length > 0;
  const showEmpty = submitted.length <= 2;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Sparkles className="h-6 w-6 text-primary" /> AI research
        </h1>
        <p className="text-sm text-muted-foreground">
          Ask questions across the document corpus — get cited excerpts from the source filings.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-5">
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runSearch();
                }}
                placeholder="e.g. How has free cash flow evolved for Reliance over the last three years?"
                rows={5}
                className="w-full resize-none rounded-xl border border-input bg-background/50 px-3 py-2.5 text-sm shadow-sm backdrop-blur placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="mt-3 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Press Ctrl / ⌘ + Enter to search</p>
                <Button onClick={runSearch} disabled={query.trim().length < 3 || isLoading}>
                  {isLoading ? <Spinner size="sm" /> : <SearchIcon className="h-4 w-4" />}
                  Search filings
                </Button>
              </div>
            </CardContent>
          </Card>

          {isLoading && (
            <Card>
              <CardContent className="flex items-center justify-center gap-3 p-10 text-muted-foreground">
                <Spinner /> Searching and reranking document excerpts…
              </CardContent>
            </Card>
          )}

          {isError && (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Something went wrong while searching. Please try again.
              </CardContent>
            </Card>
          )}

          {showEmpty && (
            <EmptyState
              icon={<Sparkles className="h-7 w-7" />}
              title="Ask anything about the filings"
              description="Run a semantic search across annual reports and filings to surface cited answers with relevance scores."
            />
          )}

          {hasResults && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {results.length} citation{results.length !== 1 ? "s" : ""} for &ldquo;{submitted}&rdquo;
              </p>
              {results.map((r) => (
                <Card key={r.id}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <FileText className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold">{docTitle.get(r.documentId) ?? "Financial filing"}</p>
                          <p className="text-xs text-muted-foreground">Page {r.page} · {r.section}</p>
                        </div>
                      </div>
                      <Badge variant={r.score >= 0.5 ? "success" : "warning"}>
                        {(r.score * 100).toFixed(0)}% match
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{r.text}</p>
                    <div className="mt-3 flex items-center gap-2 text-xs text-primary">
                      <ExternalLink className="h-3.5 w-3.5" />
                      <button className="hover:underline" onClick={() => setSubmitted(r.section)}>
                        Open in document viewer
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Database className="h-4 w-4 text-primary" /> How it works</CardTitle>
            <CardDescription>The semantic research pipeline.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {PIPELINE_STEPS.map((step, i) => (
              <div key={step.title} className="relative flex gap-3">
                {i < PIPELINE_STEPS.length - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-8px)] w-px bg-border" />}
                <span className="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{step.body}</p>
                </div>
              </div>
            ))}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">Pro tip:</span> scope results by visiting a company page and searching from its document viewer.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}