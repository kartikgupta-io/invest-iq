"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Building2, Search, TrendingUp } from "lucide-react";
import { useCompanySearch } from "@/lib/api";
import { useUiStore } from "@/store";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn, formatOrDash } from "@/lib/utils";
import { colorFromSlug } from "@/data/account";

export function CommandPalette() {
  const { commandOpen, setCommandOpen, pushRecent, recentSearches } = useUiStore();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const router = useRouter();
  const { data: results = [] } = useCompanySearch(query);

  useEffect(() => {
    if (!commandOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCommandOpen(false);
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, results.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
      if (e.key === "Enter" && results[selected]) {
        pushRecent(results[selected].ticker);
        router.push(`/company/${results[selected].slug}`);
        setCommandOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandOpen, results, selected, router, pushRecent, setCommandOpen]);

  const shown = useMemo(() => (query.trim() ? results : []), [query, results]);

  return (
    <Dialog open={commandOpen} onOpenChange={setCommandOpen}>
      <DialogContent className="top-[18%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogTitle className="sr-only">Search companies</DialogTitle>
        <div className="flex items-center gap-3 border-b border-border/60 px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
            placeholder="Search by company, ticker, or sector…"
            className="h-12 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
          <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">ESC</kbd>
        </div>
        <div className="max-h-[320px] overflow-y-auto p-2">
          {!query.trim() && recentSearches.length > 0 && (
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Recent</div>
          )}
          {!query.trim() && recentSearches.map((t) => (
            <button key={t} onClick={() => setQuery(t)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-accent">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              {t}
            </button>
          ))}
          {shown.length === 0 && query.trim() && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">No companies found for “{query}”.</div>
          )}
          {shown.map((c, i) => (
            <button
              key={`${c.slug}-${c.ticker}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => { pushRecent(c.ticker); router.push(`/company/${c.slug}`); setCommandOpen(false); }}
              className={cn("flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm", i === selected && "bg-accent")}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${colorFromSlug(c.slug)}22` }}>
                <Building2 className="h-4 w-4" style={{ color: colorFromSlug(c.slug) }} />
              </span>
              <span className="flex-1">
                <span className="block font-medium">{c.name}</span>
                <span className="block text-xs text-muted-foreground">{c.ticker} · {c.exchange} · {c.sector}</span>
              </span>
              <span className={cn(
                "text-xs font-medium tabular-nums",
                c.liveData === false || c.changePct == null ? "text-muted-foreground" : c.changePct >= 0 ? "text-emerald-500" : "text-rose-500",
              )}>
                {c.liveData === false
                  ? "NSE"
                  : formatOrDash(c.changePct, (value) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`)}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}