"use client";

import { useEffect, useState } from "react";
import { Cpu, Download, Loader2, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BROWSER_MODELS,
  generateGroundedAnswer,
  isModelReady,
  loadBrowserModel,
  readyModelId,
  type GroundedCitation,
  type ModelProgress,
} from "@/lib/browser-ai";
import { cn } from "@/lib/utils";

type Status = "idle" | "loading" | "ready" | "error";

function describeProgress(event: ModelProgress): string {
  if (event.status === "progress" && event.file) {
    const pct = event.progress != null ? `${Math.round(event.progress)}%` : "";
    const file = event.file.split("/").pop() ?? event.file;
    return `Downloading ${file} ${pct}`.trim();
  }
  if (event.status === "download") return "Fetching model files…";
  if (event.status === "initiate") return "Preparing model…";
  if (event.status === "done") return "Model ready";
  return event.status;
}

/**
 * Optional on-device answer layer. The visitor explicitly loads a model; no
 * weights or runtime are fetched before that click. Answers are grounded in
 * the citations passed from the retrieval panel.
 */
export function BrowserAiPanel({
  question,
  citations,
}: {
  question: string;
  citations: GroundedCitation[];
}) {
  const [modelId, setModelId] = useState(BROWSER_MODELS[0].id);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    // The model lives in a module singleton; sync after hydration so server
    // and client render the same initial UI.
    const timer = setTimeout(() => {
      const ready = readyModelId();
      if (ready) {
        setModelId(ready);
        setStatus("ready");
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const model = BROWSER_MODELS.find((item) => item.id === modelId) ?? BROWSER_MODELS[0];
  const ready = status === "ready" && isModelReady(model.id);

  async function loadModel() {
    setError(null);
    setStatus("loading");
    setProgress(0);
    setNote("Preparing model…");
    try {
      await loadBrowserModel(model, (event) => {
        if (event.status === "progress" && event.progress != null) {
          setProgress(Math.max(0, Math.min(100, event.progress)));
        }
        setNote(describeProgress(event));
      });
      setStatus("ready");
      setProgress(100);
      setNote("Model loaded in this browser tab.");
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function ask() {
    if (!ready || !question.trim() || citations.length === 0) return;
    setGenerating(true);
    setError(null);
    try {
      setAnswer(await generateGroundedAnswer(question, citations));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display flex items-center gap-2 text-sm font-semibold">
            <Cpu className="h-4 w-4 text-primary" /> In-browser AI answer
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Optional on-device model — nothing is downloaded until you load it. Answers use only the
            citations on this page and cite them inline.
          </p>
        </div>
        <Badge
          variant={ready ? "success" : status === "error" ? "destructive" : status === "loading" ? "warning" : "outline"}
          className="shrink-0"
        >
          {ready ? "Model ready" : status === "loading" ? "Loading" : status === "error" ? "Load failed" : "Not loaded"}
        </Badge>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Choose browser model">
          {BROWSER_MODELS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                if (status === "loading") return;
                setModelId(option.id);
                setStatus(isModelReady(option.id) ? "ready" : "idle");
                setAnswer(null);
                setError(null);
              }}
              className={cn(
                "rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                option.id === modelId
                  ? "border-primary/50 bg-primary/10"
                  : "border-border/60 hover:border-primary/30 hover:bg-background/50",
              )}
            >
              <span className="block font-semibold">{option.label}</span>
              <span className="block text-muted-foreground">{option.note}</span>
            </button>
          ))}
        </div>

        {!ready ? (
          <Button onClick={loadModel} disabled={status === "loading"} size="sm" variant="soft">
            {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {status === "loading" ? "Loading model…" : isModelReady(model.id) ? "Model already loaded" : "Load model"}
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={ask} disabled={generating || !question.trim() || citations.length === 0} size="sm">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? "Thinking…" : "Answer with AI"}
            </Button>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Grounded in {citations.length} retrieved citation
              {citations.length === 1 ? "" : "s"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.reload()}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Unload
            </Button>
          </div>
        )}

        {status === "loading" ? (
          <div className="space-y-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress || 4}%` }} />
            </div>
            <p className="text-[11px] tabular-nums text-muted-foreground">{note}</p>
          </div>
        ) : null}

        {error ? <p className="text-xs text-rose-500" role="alert">{error}</p> : null}

        {answer ? (
          <div className="rounded-xl border border-border/60 bg-background/60 p-3.5">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Generated answer · verify against the cited excerpts
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{answer}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
