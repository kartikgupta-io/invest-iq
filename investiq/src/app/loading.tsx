"use client";

import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";

export default function Loading() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5">
      <div className="bg-mesh pointer-events-none absolute inset-0" />
      <div className="relative">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border/60 bg-card/60 text-primary shadow-glow backdrop-blur-xl">
          <TrendingUp className="h-7 w-7" />
        </div>
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-2xl border-2 border-primary/40"
          animate={{ scale: [1, 1.35], opacity: [0.6, 0] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
        />
      </div>
      <div className="relative flex flex-col items-center gap-2">
        <p className="text-sm font-medium tracking-wide text-foreground">InvestIQ AI</p>
        <div className="h-1 w-28 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-primary"
            animate={{ x: ["-100%", "200%"] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
        <p className="text-xs text-muted-foreground">Loading intelligence…</p>
      </div>
    </div>
  );
}