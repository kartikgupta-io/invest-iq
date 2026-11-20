"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const dim = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-8 w-8" : "h-5 w-5";
  return <LoaderCircle className={cn("animate-spin text-muted-foreground", dim, className)} />;
}

export function FullScreenLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <div className="relative">
        <div className="h-12 w-12 rounded-2xl bg-primary/10" />
        <LoaderCircle className="absolute left-3 top-3 h-6 w-6 animate-spin text-primary" />
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

const SkeletonCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("animate-pulse rounded-2xl border border-border/60 bg-card/60 p-5", className)} {...props} />
  ),
);
SkeletonCard.displayName = "SkeletonCard";

export { SkeletonCard };