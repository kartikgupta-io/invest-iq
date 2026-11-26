"use client";

import { useState } from "react";
import { BrowserAiPanel } from "@/components/app/browser-ai-panel";
import type { GroundedCitation } from "@/lib/browser-ai";
import { Bot, Building2, Database, ExternalLink, Search, Sparkles } from "lucide-react";
import useSWR from "swr";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusLed } from "@/components/ui/status-led";
import { API_BASE, fetcher } from "@/lib/swr";
import { useUiStore } from "@/store";

type Source = { id: string; company: string; title: string; snippet: string; url: string; score: number };
type Answer = {
  question: string;
  company: string | null;
  available: boolean;
  answer: string | null;
  sources: Source[];
  provider: string | null;
  model: string | null;
  reason: string | null;
};

const EXAMPLES = [
  "What does Reliance's annual report say about Jio?",
  "Which companies have the strongest return on equity?",
  "Find evidence about TCS revenue growth",
];

export function AiResearchDrawer() {
  const open = useUiStore((s) => s.aiDrawerOpen);
  const setOpen = useUiStore((s) => s.setAiDrawer);
  const target = useUiStore((s) => s.aiTarget);
  const { data: status } = useSWR<{ available: boolean; provider: string | null; model: string | null }>(
    `${API_BASE}/ai-local/status`,
    fetcher,
    { revalidateOnFocus: false },
  );
  const [question, setQuestion] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");
  const [answerState, setAnswerState] = useState<(Answer & { target: string | null }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const examples = target
    ? [
        `What does ${target} do?`,
        `Summarize ${target}'s latest fundamentals and risks`,
        `What do the latest filings say about ${target}?`,
      ]
    : EXAMPLES;

  // An answer is only shown for the security it was retrieved for; changing
  // the searched security hides the old answer without a cascading effect.
  const result = answerState?.target === target ? answerState : null;
  const browserCitations: GroundedCitation[] = result?.sources.map((source) => ({
    documentTitle: source.title,
    section: source.company,
    page: 0,
    text: source.snippet,
    url: source.url,
    source: source.company,
  })) ?? [];

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    setBusy(true);
    setError(null);
    setAnswerState(null);
    setLastQuestion(q);
    try {
      const response = await fetch(
        `${API_BASE}/ai-local/ask`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q, limit: 6, company: target ?? undefined }),
        },
      );
      if (!response.ok) throw new Error(`Research request failed (${response.status})`);
      setAnswerState({ ...((await response.json()) as Answer), target });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Research request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="glass-panel !left-auto !right-0 !top-0 !h-full !max-w-md !translate-x-0 !translate-y-0 !gap-0 !rounded-none !border-y-0 !border-r-0 !p-0 flex flex-col">
        <DialogHeader className="border-b border-border/60 p-5">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" /> AI Research
          </DialogTitle>
          <DialogDescription className="text-xs">
            {target
              ? `Scoped to ${target}. Grounded in its real filings, fundamentals and secondary sources; every claim links to its source.`
              : "Grounded in real harvested evidence and a local model. Every claim links to its source."}
          </DialogDescription>
          <div className="flex items-center gap-2 pt-1">
            {target ? <Badge variant="outline" className="gap-1.5"><Building2 className="h-3 w-3" /> {target}</Badge> : null}
            {status?.available ? (
              <Badge variant="success" className="gap-1.5">
                <StatusLed tone="live" label="Model ready" /> {status.provider} · {status.model}
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1.5">
                <StatusLed tone="stale" label="No local model" /> No local model detected
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void ask(question);
            }}
            className="flex gap-2"
          >
            <Input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about a company or metric…"
              aria-label="Research question"
            />
            <Button type="submit" size="icon" disabled={busy} aria-label="Ask">
              <Search className="h-4 w-4" />
            </Button>
          </form>

          {!result && !busy && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Try a question</p>
              {examples.map((example) => (
                <button
                  key={example}
                  onClick={() => {
                    setQuestion(example);
                    void ask(example);
                  }}
                  className="jump glass-panel block w-full rounded-xl px-3 py-2 text-left text-sm hover:border-primary/40"
                >
                  {example}
                </button>
              ))}
            </div>
          )}

          {busy && (
            <div className="space-y-2 text-sm text-muted-foreground" aria-live="polite">
              <p className="flex items-center gap-2"><Database className="h-4 w-4" /> Retrieving real evidence…</p>
              <p className="flex items-center gap-2"><Bot className="h-4 w-4" /> Asking the local model…</p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {result && (
            <div className="space-y-4">
              <ol className="space-y-1 text-xs text-muted-foreground">
                <li>1 · Retrieved {result.sources.length} real evidence snippets{result.company ? ` for ${result.company}` : ""}</li>
                <li>2 · {result.available ? `Synthesized with ${result.provider}` : "No server model — optional in-browser AI below"}</li>
              </ol>
              {result.available && result.answer ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{result.answer}</p>
              ) : (
                <p className="text-sm text-muted-foreground">{result.reason}</p>
              )}
              {!result.available && result.sources.length > 0 ? (
                <BrowserAiPanel question={lastQuestion} citations={browserCitations} />
              ) : null}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Sources (click to verify)</p>
                {result.sources.map((source) => (
                  <a
                    key={source.id}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="jump glass-panel block rounded-xl p-3 hover:border-[var(--led)]/50"
                  >
                    <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{source.company}</span>
                      <ExternalLink className="h-3 w-3" />
                    </span>
                    <span className="mt-1 block text-sm font-medium">{source.title}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{source.snippet}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
