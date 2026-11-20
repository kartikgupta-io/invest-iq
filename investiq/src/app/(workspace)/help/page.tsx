"use client";

import { useMemo, useState } from "react";
import { Search as SearchIcon, LifeBuoy, ChevronDown, ChevronUp, Mail, CircleHelp } from "lucide-react";
import { useHelpArticles, useHelpCategories } from "@/lib/api";
import { faqItems } from "@/data/account";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SkeletonCard } from "@/components/ui/loader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function HelpPage() {
  const categories = useHelpCategories();
  const [category, setCategory] = useState<string>("All");
  const [search, setSearch] = useState("");
  const { data: articles, isLoading } = useHelpArticles(category);

  const [openId, setOpenId] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!articles) return [];
    const q = search.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter(
      (a) => a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q),
    );
  }, [articles, search]);

  const faq = useMemo(() => faqItems(), []);

  const openArticle = articles?.find((a) => a.id === openId);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <LifeBuoy className="h-6 w-6 text-primary" /> Help center
        </h1>
        <p className="text-sm text-muted-foreground">Guides and answers for using InvestIQ AI.</p>
      </div>

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search help articles…"
          className="h-11 pl-11 shadow-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              category === c
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/60 bg-card/40 text-muted-foreground hover:border-primary/40"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} className="h-32" />)}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            No articles match your search.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((a) => (
          <button key={a.id} onClick={() => setOpenId(a.id)} className="block text-left">
            <Card className="h-full transition-colors hover:border-primary/40">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{a.category}</Badge>
                  <HelpCircleIcon className="h-4 w-4 text-muted-foreground" />
                </div>
                <CardTitle className="text-base leading-snug">{a.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="line-clamp-3 text-sm text-muted-foreground">{a.body}</p>
                <p className="mt-2 text-xs font-medium text-primary">Read more →</p>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><HelpCircleIcon className="h-4 w-4 text-primary" /> Frequently asked questions</CardTitle>
          <CardDescription>Quick answers to common questions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {faq.map((f) => {
            const isOpen = openFaq === f.q;
            return (
              <div key={f.q} className="rounded-xl border border-border/60 bg-card/40">
                <button
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium"
                  onClick={() => setOpenFaq(isOpen ? null : f.q)}
                >
                  {f.q}
                  {isOpen ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </button>
                {isOpen && <p className="px-4 pb-4 text-sm text-muted-foreground">{f.a}</p>}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary"><Mail className="h-5 w-5" /></span>
            <div>
              <p className="font-semibold">Still need help?</p>
              <p className="text-sm text-muted-foreground">Our analyst support team replies within a business day.</p>
            </div>
          </div>
          <Button variant="soft">Contact support</Button>
        </CardContent>
      </Card>

      <Dialog open={!!openArticle} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent>
          {openArticle && (
            <>
              <DialogHeader>
                <Badge variant="outline" className="w-fit">{openArticle.category}</Badge>
                <DialogTitle>{openArticle.title}</DialogTitle>
                <DialogDescription>Help article</DialogDescription>
              </DialogHeader>
              <p className="text-sm leading-relaxed text-muted-foreground">{openArticle.body}</p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HelpCircleIcon({ className }: { className?: string }) {
  return <CircleHelp className={className} />;
}