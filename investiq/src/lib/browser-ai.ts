"use client";

/**
 * Optional, user-loaded in-browser language model.
 *
 * Nothing is downloaded until the visitor clicks "Load model". The heavy
 * Transformers.js runtime is imported dynamically so it never enters the
 * initial page bundle. Answers are grounded in citations already retrieved
 * from the real filing corpus — the model cannot invent market data because
 * it only ever sees those snippets, and is instructed to cite them.
 */

export type BrowserModel = {
  id: string;
  label: string;
  note: string;
  dtype: "q4" | "q8";
};

export const BROWSER_MODELS: BrowserModel[] = [
  {
    id: "onnx-community/SmolLM2-135M-Instruct-ONNX",
    label: "SmolLM2 135M",
    note: "Fastest · small download · WebGPU / WASM",
    dtype: "q4",
  },
  {
    id: "onnx-community/Qwen2.5-0.5B-Instruct",
    label: "Qwen2.5 0.5B",
    note: "More capable · larger download · WebGPU / WASM",
    dtype: "q4",
  },
];

export type ModelProgress = {
  status: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
};

type Generator = (text: string, options?: Record<string, unknown>) => Promise<unknown>;

let generator: Generator | null = null;
let loadedId: string | null = null;
let loading: Promise<Generator> | null = null;

export function isModelReady(modelId?: string): boolean {
  return Boolean(generator) && (!modelId || loadedId === modelId);
}

export function readyModelId(): string | null {
  return loadedId;
}

/** Load (or reuse) a model. Concurrent calls share one in-flight promise. */
export async function loadBrowserModel(
  model: BrowserModel,
  onProgress: (progress: ModelProgress) => void,
): Promise<void> {
  if (generator && loadedId === model.id) return;
  if (loading) {
    await loading;
    return;
  }

  loading = (async () => {
    const { pipeline, env } = await import("@huggingface/transformers");
    // Model weights stream from the Hugging Face CDN on first use only.
    env.allowLocalModels = false;
    const webGpuAvailable =
      typeof navigator !== "undefined" && "gpu" in navigator;
    const instance = await pipeline("text-generation", model.id, {
      device: webGpuAvailable ? "webgpu" : "wasm",
      dtype: model.dtype,
      progress_callback: (event: ModelProgress) => onProgress(event),
    });
    generator = instance as unknown as Generator;
    loadedId = model.id;
    return generator;
  })();

  try {
    await loading;
  } catch (error) {
    loading = null;
    throw error;
  } finally {
    loading = null;
  }
}

export type GroundedCitation = {
  documentTitle: string;
  section: string;
  page: number;
  text: string;
  /** Real source URL — filings/publisher links or Yahoo Finance news. */
  url?: string;
  source?: string;
};

function buildPrompt(question: string, citations: GroundedCitation[]): string {
  const evidence = citations
    .map((item, index) => {
      const location = item.page > 0 ? `page ${item.page}` : (item.source || "external source");
      const link = item.url ? `\n    Source: ${item.url}` : "";
      return `[${index + 1}] ${item.documentTitle} — ${item.section} (${location})\n${item.text}${link}`;
    })
    .join("\n\n");

  return [
    "You are a careful equity research assistant.",
    "Answer ONLY from the numbered evidence below. Cite every factual claim with its [n] marker.",
    'If the evidence is insufficient, say exactly: "The retrieved sources do not contain enough information."',
    "Never use outside knowledge, never invent numbers, and never state a value absent from the evidence.",
    "",
    `Question: ${question}`,
    "",
    "Evidence (real retrieved snippets):",
    evidence,
    "",
    "Answer:",
  ].join("\n");
}

/** Generate a short, cited answer from the supplied retrieval hits. */
export async function generateGroundedAnswer(
  question: string,
  citations: GroundedCitation[],
): Promise<string> {
  if (!generator) throw new Error("Load a model before asking a question.");
  const prompt = buildPrompt(question, citations);
  const output = await generator(prompt, {
    max_new_tokens: 240,
    do_sample: false,
    return_full_text: false,
  });
  const first = Array.isArray(output) ? output[0] : output;
  const text =
    first && typeof first === "object" && "generated_text" in first
      ? String((first as { generated_text: unknown }).generated_text ?? "")
      : "";
  return text.trim() || "The model returned no answer.";
}
