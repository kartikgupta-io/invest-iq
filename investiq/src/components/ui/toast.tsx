"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "success" | "error" | "info";

type Toast = {
  id: string;
  title: string;
  description?: string;
  tone: Tone;
  action?: { label: string; onClick: () => void };
};

type ToastInput = Omit<Toast, "id" | "tone"> & { tone?: Tone };

const ToastContext = React.createContext<{ push: (toast: ToastInput) => void } | null>(null);

const TONE_META: Record<Tone, { icon: React.ElementType; className: string }> = {
  success: { icon: CheckCircle2, className: "text-emerald-500" },
  error: { icon: AlertTriangle, className: "text-rose-500" },
  info: { icon: Info, className: "text-sky-500" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const timers = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = React.useCallback((id: string) => {
    setToasts((items) => items.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const push = React.useCallback(
    (input: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const toast: Toast = { ...input, id, tone: input.tone ?? "info" };
      setToasts((items) => [...items.slice(-3), toast]);
      timers.current.set(id, setTimeout(() => dismiss(id), 5000));
    },
    [dismiss],
  );

  React.useEffect(() => {
    const map = timers.current;
    return () => map.forEach((timer) => clearTimeout(timer));
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((toast) => {
          const meta = TONE_META[toast.tone];
          const Icon = meta.icon;
          return (
            <div
              key={toast.id}
              role="status"
              className="glass-panel pointer-events-auto flex items-start gap-3 rounded-xl p-3.5 shadow-xl"
            >
              <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", meta.className)} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{toast.description}</p>
                ) : null}
                {toast.action ? (
                  <button
                    type="button"
                    onClick={() => {
                      toast.action?.onClick();
                      dismiss(toast.id);
                    }}
                    className="mt-2 text-xs font-semibold text-primary hover:underline"
                  >
                    {toast.action.label}
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
                className="rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
