"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BellRing,
  ListFilter,
  LockKeyhole,
  NotebookPen,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";

import { BrandMark } from "@/components/app/brand-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { signIn, signUp } from "@/lib/workspace";

type Mode = "signin" | "signup";

const BENEFITS = [
  {
    icon: ListFilter,
    title: "Saved screens",
    body: "Name a screener setup and return to the exact filters without rebuilding it.",
  },
  {
    icon: BellRing,
    title: "Price alerts",
    body: "Set thresholds on tickers you follow and see them checked against live quotes.",
  },
  {
    icon: NotebookPen,
    title: "Research notes",
    body: "Keep your thesis and findings alongside the companies you are digging into.",
  },
  {
    icon: SlidersHorizontal,
    title: "Your preferences",
    body: "Density, freshness and notification settings remembered the way you like them.",
  },
] as const;

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignUp = mode === "signup";

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      if (isSignUp) await signUp(name, email, password);
      else await signIn(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 h-full w-full" />
      <div aria-hidden className="bg-mesh pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/4 h-80 w-80 rounded-full bg-primary/15 blur-3xl"
      />

      <div className="relative grid w-full max-w-5xl gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <Card className="relative overflow-hidden p-6 sm:p-8">
          <div className="mb-8 flex items-center gap-3">
            <BrandMark className="h-10 w-10" />
            <div>
              <p className="font-display text-base font-semibold leading-tight tracking-tight">InvestIQ</p>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Research cockpit</p>
            </div>
          </div>

          <h1 className="text-2xl font-semibold sm:text-3xl">
            {isSignUp ? "Create your workspace" : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isSignUp
              ? "Set up one place for your screens, alerts and research."
              : "Sign in to pick up where you left off."}
          </p>

          <div
            role="group"
            aria-label="Account mode"
            className="mt-6 grid w-full grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1 text-muted-foreground"
          >
            <button
              type="button"
              aria-pressed={!isSignUp}
              onClick={() => switchMode("signin")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                !isSignUp && "bg-background text-foreground shadow-sm",
              )}
            >
              Sign in
            </button>
            <button
              type="button"
              aria-pressed={isSignUp}
              onClick={() => switchMode("signup")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isSignUp && "bg-background text-foreground shadow-sm",
              )}
            >
              Create account
            </button>
          </div>

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  name="name"
                  autoComplete="name"
                  placeholder="How should we address you?"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={busy}
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={busy}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                placeholder={isSignUp ? "At least 6 characters" : "Your password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
                required
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Working…" : isSignUp ? "Create account" : "Sign in"}
              {!busy && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <span>or</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <Link
            href="/dashboard"
            className="flex items-center justify-center gap-2 rounded-xl text-sm font-medium text-foreground/80 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Continue as guest <ArrowRight className="h-4 w-4" />
          </Link>

          <div className="mt-6 flex gap-3 rounded-xl border border-border/70 bg-muted/40 p-3.5">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <p className="text-xs leading-relaxed text-muted-foreground">
              This is a <span className="font-medium text-foreground/80">local workspace</span>, not a
              server-backed identity. Your screens, alerts, notes and preferences stay together across
              visits <span className="font-medium text-foreground/80">in this browser</span> — so please
              don&apos;t reuse a sensitive password.
            </p>
          </div>
        </Card>

        <Card className="relative flex flex-col overflow-hidden p-6 sm:p-8">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl"
          />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-primary">
              <ShieldCheck className="h-4 w-4" aria-hidden />
              <span className="text-[11px] font-medium uppercase tracking-[0.18em]">What you get</span>
            </div>
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground tabular-nums">
              01 — 04
            </span>
          </div>
          <h2 className="relative mt-3 text-xl font-semibold">
            A workspace that keeps up with your research.
          </h2>
          <p className="relative mt-2 text-sm text-muted-foreground">
            Everything below is kept together with your account in this browser.
          </p>

          <CardContent className="relative mt-6 space-y-5 p-0">
            {BENEFITS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{body}</p>
                </div>
              </div>
            ))}
          </CardContent>

          <div className="relative mt-auto flex items-center gap-2 border-t border-border/70 pt-5 text-xs text-muted-foreground">
            <BrandMark className="h-6 w-6 opacity-80" />
            <span>Built for independent investors who like to stay organized.</span>
          </div>
        </Card>
      </div>
    </main>
  );
}
