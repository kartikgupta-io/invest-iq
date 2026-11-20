"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Star, X } from "lucide-react";
import { useCompanies, useCompanySearch, useWatchlists } from "@/lib/api";
import { useWatchlistStore } from "@/store";
import type { CompanySummary } from "@/lib/types";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SkeletonCard } from "@/components/ui/loader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const COLORS = ["#7c3aed", "#0ea5e9", "#16a34a", "#f97316", "#ef4444", "#f59e0b", "#6366f1", "#f43f5e"];

export default function WatchlistsPage() {
  const { data: remoteLists } = useWatchlists();
  const {
    watchlists,
    setWatchlists,
    createWatchlist,
    removeWatchlist,
    addSymbol,
    removeSymbol,
  } = useWatchlistStore();
  const { data: allCompanies } = useCompanies();

  useEffect(() => {
    if (remoteLists && remoteLists.length && watchlists.length === 0) setWatchlists(remoteLists);
  }, [remoteLists, watchlists.length, setWatchlists]);

  const companyByTicker = useMemo(() => {
    const map = new Map<string, CompanySummary>();
    for (const c of allCompanies ?? []) map.set(c.ticker, c);
    return map;
  }, [allCompanies]);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);

  const [addFor, setAddFor] = useState<string | null>(null);
  const [symbolQuery, setSymbolQuery] = useState("");
  const { data: addResults, isLoading: addLoading } = useCompanySearch(symbolQuery);

  const addCandidates = useMemo(() => {
    if (!symbolQuery.trim() || !addFor) return [];
    return (addResults ?? []).filter(
      (c) => !watchlists.find((w) => w.id === addFor)?.symbols.includes(c.ticker),
    ).slice(0, 5);
     
  }, [symbolQuery, addResults, addFor, watchlists]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Watchlists</h1>
          <p className="text-sm text-muted-foreground">Build and manage curated lists of companies.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New watchlist</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {watchlists.length === 0 && (
          <Card className="sm:col-span-2 xl:col-span-3">
            <CardContent className="flex items-center gap-3 p-6 text-muted-foreground">
              <Star className="h-5 w-5" /> No watchlists yet — create one to start tracking companies.
            </CardContent>
          </Card>
        )}

        {watchlists.map((w) => {
          const symbols = w.symbols
            .map((t) => companyByTicker.get(t))
            .filter((c): c is CompanySummary => Boolean(c));
          return (
            <Card key={w.id}>
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div className="flex items-center gap-2.5">
                  <span className="h-3 w-3 rounded-full" style={{ background: w.color }} />
                  <div>
                    <CardTitle className="text-base">{w.name}</CardTitle>
                    <CardDescription>{w.symbols.length} symbols · updated {w.updatedAt}</CardDescription>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => removeWatchlist(w.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {symbols.length === 0 && (
                  <p className="text-sm text-muted-foreground">Add symbols below to populate this list.</p>
                )}
                {symbols.map((c) => (
                  <div key={c.ticker} className="flex items-center justify-between rounded-xl border border-border/60 bg-card/40 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.ticker}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={c.changePct >= 0 ? "success" : "destructive"}>
                        {c.changePct >= 0 ? "+" : ""}{formatPercent(c.changePct)}
                      </Badge>
                      <span className="text-sm tabular-nums">{formatCurrency(c.price, "₹")}</span>
                      <button
                        onClick={() => removeSymbol(w.id, c.ticker)}
                        className="ml-1 rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Remove ${c.ticker}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full mt-1" onClick={() => { setAddFor(w.id); setSymbolQuery(""); }}>
                  <Plus className="h-4 w-4" /> Add symbol
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create watchlist</DialogTitle>
            <DialogDescription>Name your new list and pick an accent color.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="wl-name">Name</Label>
              <Input id="wl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. High Conviction" />
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((cl) => (
                  <button
                    key={cl}
                    onClick={() => setColor(cl)}
                    className={`h-8 w-8 rounded-full transition-transform ${color === cl ? "ring-2 ring-ring ring-offset-2 ring-offset-background scale-110" : ""}`}
                    style={{ background: cl }}
                    aria-label={cl}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={!name.trim()}
              onClick={() => {
                createWatchlist(name.trim(), color);
                setName("");
                setCreateOpen(false);
              }}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!addFor} onOpenChange={(o) => !o && setAddFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add symbol</DialogTitle>
            <DialogDescription>Search for a company to add to this watchlist.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Input value={symbolQuery} onChange={(e) => setSymbolQuery(e.target.value)} placeholder="Search by ticker or name…" autoFocus />
          </div>
          <div className="space-y-1.5">
            {addLoading && <SkeletonCard className="h-10" />}
            {!addLoading && addCandidates.length === 0 && symbolQuery.trim() && (
              <p className="px-1 py-2 text-sm text-muted-foreground">No new matches.</p>
            )}
            {addCandidates.map((c) => (
              <div key={c.ticker} className="flex items-center justify-between rounded-xl border border-border/60 bg-card/40 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.ticker} · {c.sector}</p>
                </div>
                <Button
                  size="sm"
                  variant="soft"
                  onClick={() => {
                    if (addFor) addSymbol(addFor, c.ticker);
                    setSymbolQuery("");
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}