"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  Database,
  Brain,
  Globe,
  Layers,
  Lock,
  ArrowRight,
  Sparkles,
  Activity,
  Shield,
  CircleDot,
  ScrollText,
  Landmark,
  Gauge,
  Check,
  Zap,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { EChart } from "@/components/charts/echart";

const NAV_LINKS = [
  { label: "Platform", href: "#platform" },
  { label: "Data", href: "#data" },
  { label: "AI Research", href: "#ai-research" },
  { label: "Pricing", href: "#pricing" },
  { label: "Docs", href: "#docs" },
];

const FEATURES = [
  {
    icon: Database,
    title: "Institutional data ingestion",
    desc: "Native ingestion from SEC EDGAR, NSE and BSE filings — every document chunked, indexed and kept in sync.",
  },
  {
    icon: Brain,
    title: "AI semantic research",
    desc: "Ask questions in plain language and receive answers grounded in source filings, with chart citations built in.",
  },
  {
    icon: Globe,
    title: "Cross-market coverage",
    desc: "Track US and India-listed publishers side by side with normalized fundamentals across exchanges.",
  },
  {
    icon: Layers,
    title: "Fund-grade charting",
    desc: "Interactive Apache ECharts visualizations—revenue, margins, cash flow and valuation at your fingertips.",
  },
  {
    icon: CircleDot,
    title: "Portfolio intelligence",
    desc: "Holdings, watchlists and peer groups surfaced as actionable context next to every analysis you run.",
  },
  {
    icon: Lock,
    title: "Granular access controls",
    desc: "Role-based permissions, sharing and fine-grained visibility keep sensitive research in the right hands.",
  },
];

const STEPS = [
  {
    icon: Database,
    title: "Ingest",
    text: "Filings from SEC EDGAR, NSE and BSE are pulled, parsed and normalized into a unified document corpus.",
  },
  {
    icon: Brain,
    title: "Analyse",
    text: "Semantic search and AI reasoning surface the operative lines from source documents, with citeable evidence.",
  },
  {
    icon: TrendingUp,
    title: "Decide",
    text: "Turn grounded insight into portable funds and chart-backed notes you can act on across markets.",
  },
];

const TRUST_LOGOS = ["Yahoo Finance", "Screener.in", "NSE", "BSE", "Issuer filings", "SEC EDGAR"];

const PROOF_POINTS = [
  {
    icon: Database,
    title: "Live market data",
    desc: "Quotes, ranges and volume are fetched on demand from Yahoo Finance for NSE-listed tickers — never generated in the demo.",
  },
  {
    icon: ScrollText,
    title: "Cited evidence",
    desc: "Every research hit links back to the original annual report or filing page, so a claim can be verified in one click.",
  },
  {
    icon: Shield,
    title: "No fabricated numbers",
    desc: "When a source is unavailable the UI says so. Fundamentals come from Screener.in company disclosures with an as-of timestamp.",
  },
];

const FAINT = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.6, ease: "easeOut" as const },
};

function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div initial={FAINT.initial} whileInView={FAINT.whileInView} viewport={FAINT.viewport} transition={FAINT.transition} className={className}>
      {children}
    </motion.div>
  );
}

function Navbar() {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="glass mx-auto my-3 flex max-w-7xl items-center justify-between gap-4 rounded-2xl px-6 py-3">
        <a href="#" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <TrendingUp className="h-4 w-4" />
          </span>
          InvestIQ AI
        </a>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          {NAV_LINKS.map((l) => (
            <a key={l.label} href={l.href} className="transition-colors hover:text-foreground">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.push("/login")}>
            Sign in
          </Button>
          <Button size="sm" onClick={() => router.push("/login")}>
            Get started
          </Button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const router = useRouter();
  return (
    <section className="relative overflow-hidden">
      <div className="bg-grid pointer-events-none absolute inset-0 h-full w-full" />
      <div className="bg-mesh pointer-events-none absolute inset-0" />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-10 left-1/4 h-72 w-72 rounded-full bg-primary/20 blur-3xl"
        animate={{ y: [0, -18, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute right-10 top-20 h-64 w-64 rounded-full bg-chart-2/20 blur-3xl"
        animate={{ y: [0, 16, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 py-24 lg:grid-cols-2 lg:py-32">
        <div className="flex flex-col items-start gap-6">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <Badge variant="secondary" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Institutional intelligence, reimagined
            </Badge>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="max-w-2xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl"
          >
            Financial intelligence from{" "}
            <span className="text-gradient">official filings</span>, grounded in evidence.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="max-w-xl text-lg text-muted-foreground"
          >
            InvestIQ AI ingests SEC EDGAR, NSE and BSE filings into one research platform with
            premium analytics, AI semantic research and citation-backed insight across markets.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="flex flex-wrap items-center gap-3"
          >
            <Button size="lg" onClick={() => router.push("/dashboard")}>
              Get started <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => router.push("/demo")}>
              See live data demo
            </Button>
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Shield className="h-4 w-4 text-success" />
            Trusted by research desks and analysts. No credit card required.
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="animate-float"
        >
          <HeroPreview />
        </motion.div>
      </div>
    </section>
  );
}

function HeroPreview() {
  return (
    <Card className="glass relative overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-sm font-medium">
            Revenue growth — Acme Corp <Badge variant="success">+18.4%</Badge>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ScrollText className="h-3.5 w-3.5" /> Cited from FY24 10-K · SEC EDGAR
          </div>
        </div>
        <div className="flex gap-1.5">
          <div className="h-2 w-2 rounded-full bg-primary/20" />
          <div className="h-2 w-2 rounded-full bg-chart-2/20" />
          <div className="h-2 w-2 rounded-full bg-success/20" />
        </div>
      </div>
      <div className="p-5">
        <EChart
          height={200}
          option={{
            grid: { left: 8, right: 8, top: 12, bottom: 8, containLabel: true },
            tooltip: {},
            xAxis: { type: "category", data: ["FY20", "FY21", "FY22", "FY23", "FY24"], axisLine: { show: false }, axisTick: { show: false } },
            yAxis: { type: "value", splitLine: { lineStyle: { color: "oklch(0.5 0 0 / 0.15)", type: "dashed" } } },
            series: [
              {
                type: "line",
                smooth: true,
                data: [120, 142, 133, 168, 182],
                symbol: "circle",
                symbolSize: 6,
                lineStyle: { width: 3, color: "oklch(0.72 0.22 285)" },
                itemStyle: { color: "oklch(0.72 0.22 285)" },
                areaStyle: {
                  color: {
                    type: "linear",
                    x: 0,
                    y: 0,
                    x2: 0,
                    y2: 1,
                    colorStops: [
                      { offset: 0, color: "oklch(0.72 0.22 285 / 0.35)" },
                      { offset: 1, color: "oklch(0.72 0.22 285 / 0)" },
                    ],
                  },
                },
              },
            ],
          }}
        />
      </div>
      <div className="grid grid-cols-3 gap-3 border-t border-border/60 px-5 py-4">
        {[
          { label: "Revenue", value: "$1.9B", up: true },
          { label: "Gross margin", value: "62%", up: false },
          { label: "Free cash", value: "$412M", up: true },
        ].map((m) => (
          <div key={m.label}>
            <p className="text-xs text-muted-foreground">{m.label}</p>
            <p className="text-sm font-semibold">{m.value}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function LogoMarquee() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-10">
      <p className="mb-6 text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Powering analysis for teams at
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
        {TRUST_LOGOS.map((l, i) => (
          <motion.span
            key={l}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
            className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"
          >
            <Landmark className="h-4 w-4" /> {l}
          </motion.span>
        ))}
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="platform" className="mx-auto max-w-7xl px-6 py-20">
      <Reveal className="mx-auto mb-12 flex max-w-2xl flex-col items-center gap-4 text-center">
        <Badge variant="secondary">Platform</Badge>
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Everything your research desk needs
        </h2>
        <p className="text-muted-foreground">
          A single surface for ingestion, semantic research, charting and portfolio context —
          engineered for speed and trust.
        </p>
      </Reveal>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: (i % 3) * 0.08 }}
          >
            <Card className="group h-full p-6 transition-colors hover:border-primary/40">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mb-1.5 font-semibold">{f.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
            </Card>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="border-y border-border/60 bg-muted/30 py-20">
      <div className="mx-auto max-w-7xl px-6">
        <Reveal className="mb-12 flex max-w-2xl flex-col items-start gap-4">
          <Badge variant="secondary">How it works</Badge>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Ingest, analyse, decide
          </h2>
          <p className="text-muted-foreground">
            A three-step pipeline turns raw regulatory filings into decision-ready, citeable insight.
          </p>
        </Reveal>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="relative"
            >
              <div className="flex h-full flex-col gap-4 rounded-2xl border border-border/60 bg-card/50 p-6 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <s.icon className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">0{i + 1}</span>
                </div>
                <div>
                  <h3 className="font-semibold">{s.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
                </div>
                {i < STEPS.length - 1 && (
                  <ArrowRight className="absolute -right-4 top-6 hidden h-4 w-4 text-muted-foreground/50 md:block" />
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

const METRICS = [
  { value: "12", label: "NSE companies in coverage" },
  { value: "3", label: "Live public data sources" },
  { value: "30m", label: "Cache TTL, refresh on demand" },
  { value: "0", label: "Fabricated values in the demo" },
];

function Metrics() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-20">
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {METRICS.map((m, i) => (
          <motion.div
            key={m.label}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: i * 0.06 }}
            className="rounded-2xl border border-border/60 bg-card/50 p-6 text-center backdrop-blur-xl"
          >
            <p className="text-gradient text-3xl font-semibold tracking-tight sm:text-4xl">{m.value}</p>
            <p className="mt-2 text-sm text-muted-foreground">{m.label}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function LivePreview() {
  return (
    <section id="ai-research" className="mx-auto max-w-7xl px-6 py-10">
      <Reveal className="mb-10 flex max-w-2xl flex-col items-center gap-4 text-center">
        <Badge variant="secondary">
          <Activity className="h-3.5 w-3.5 text-primary" />
          Live preview
        </Badge>
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Fund-grade charting, live
        </h2>
        <p className="text-muted-foreground">
          Every analysis renders interactive ECharts — hover, zoom and drill into any series.
        </p>
      </Reveal>
      <Reveal>
        <Card className="inline-block w-full overflow-hidden p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 text-sm font-medium">Revenue — FY19 · FY21</div>
              <div className="text-xs text-muted-foreground">Curated from filed annual reports</div>
            </div>
            <Badge variant="success">
              <TrendingUp className="h-3 w-3" /> On track
            </Badge>
          </div>
          <EChart
            height={220}
            option={{
              grid: { left: 8, right: 8, top: 20, bottom: 8, containLabel: true },
              tooltip: {},
              xAxis: { type: "category", data: ["F19", "F20", "F21"] },
              yAxis: { type: "value", splitLine: { lineStyle: { color: "oklch(0.5 0 0 / 0.15)", type: "dashed" } } },
              series: [
                {
                  type: "line",
                  smooth: true,
                  data: [120, 155, 182],
                  symbolSize: 7,
                  lineStyle: { width: 3, color: "oklch(0.7 0.16 192)" },
                  itemStyle: { color: "oklch(0.7 0.16 192)" },
                  areaStyle: {
                    color: {
                      type: "linear",
                      x: 0,
                      y: 0,
                      x2: 0,
                      y2: 1,
                      colorStops: [
                        { offset: 0, color: "oklch(0.7 0.16 192 / 0.35)" },
                        { offset: 1, color: "oklch(0.7 0.16 192 / 0)" },
                      ],
                    },
                  },
                },
              ],
            }}
          />
        </Card>
      </Reveal>
    </section>
  );
}

const PLANS = [
  {
    name: "Analyst",
    price: "$49",
    period: "/month",
    tagline: "For individual researchers getting started.",
    features: ["20 semantic queries / day", "SEC EDGAR + NSE coverage", "Fund-grade charting", "Community support"],
    highlight: false,
  },
  {
    name: "Pro",
    price: "$149",
    period: "/month",
    tagline: "For analysts and small research desks.",
    features: [
      "Unlimited semantic research",
      "SEC EDGAR, NSE & BSE coverage",
      "Portfolio intelligence & watchlists",
      "Advanced access controls",
      "Priority support",
    ],
    highlight: true,
    badge: "Most popular",
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "per desk",
    tagline: "For funds with complex workflows.",
    features: ["Dedicated ingestion pipelines", "Granular permissions & SSO", "On-prem or VPC deployment", "Dedicated success manager"],
    highlight: false,
  },
];

function Pricing() {
  const router = useRouter();
  return (
    <section id="pricing" className="border-y border-border/60 bg-muted/30 py-20">
      <div className="mx-auto max-w-7xl px-6">
        <Reveal className="mb-12 flex max-w-2xl flex-col items-center gap-4 text-center">
          <Badge variant="secondary">Pricing</Badge>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="text-muted-foreground">
            Start free and scale as your research deepens. Every plan unlocks the core research experience.
          </p>
        </Reveal>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {PLANS.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className={cn(
                "relative flex h-full flex-col rounded-2xl border p-6",
                p.highlight
                  ? "border-primary/50 bg-primary/5 shadow-glow"
                  : "border-border/60 bg-card/50 backdrop-blur-xl",
              )}
            >
              {p.badge && (
                <Badge className="absolute -top-3 self-center">{p.badge}</Badge>
              )}
              <h3 className="font-semibold">{p.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className={cn("text-4xl font-semibold tracking-tight", p.highlight && "text-gradient")}>
                  {p.price}
                </span>
                <span className="text-sm text-muted-foreground">{p.period}</span>
              </div>
              <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-success" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="mt-6 w-full"
                variant={p.highlight ? "default" : "outline"}
                onClick={() => router.push("/dashboard")}
              >
                {p.name === "Enterprise" ? "Talk to sales" : "Get started"}
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Testimonials() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-20">
      <Reveal className="mb-12 flex max-w-2xl flex-col items-center gap-4 text-center">
        <Badge variant="secondary">Verifiable by design</Badge>
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Real inputs. Real citations.
        </h2>
      </Reveal>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {PROOF_POINTS.map((point, i) => (
          <motion.div
            key={point.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
          >
            <Card className="flex h-full flex-col gap-4 p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <point.icon className="h-5 w-5" />
              </span>
              <p className="text-sm font-semibold">{point.title}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{point.desc}</p>
            </Card>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

const FOOTER_COLS = [
  {
    title: "Product",
    links: ["Platform", "Data coverage", "AI Research", "Charting", "Pricing"],
  },
  {
    title: "Company",
    links: ["About", "Blog", "Careers", "Contact", "Press"],
  },
  {
    title: "Resources",
    links: ["Documentation", "API reference", "Marketplace", "Changelog", "Status"],
  },
  {
    title: "Legal",
    links: ["Privacy", "Terms", "Security", "Cookies"],
  },
];

function Footer() {
  const router = useRouter();
  return (
    <footer id="docs" className="border-t border-border/60 bg-muted/30">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="max-w-xs">
            <a href="#" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <TrendingUp className="h-4 w-4" />
              </span>
              InvestIQ AI
            </a>
            <p className="mt-4 text-sm text-muted-foreground">
              Grounded financial intelligence from official filings.
            </p>
            <Button className="mt-4" variant="soft" size="sm" onClick={() => router.push("/dashboard")}>
              Get started
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {FOOTER_COLS.map((col) => (
              <div key={col.title}>
                <h4 className="mb-3 text-sm font-semibold">{col.title}</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {col.links.map((l) => (
                    <li key={l}>
                      <a href="#" className="transition-colors hover:text-foreground">
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border/60 pt-6 text-sm text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} InvestIQ AI. All rights reserved.</p>
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span>Crafted for research desks worldwide.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FinalCTA() {
  const router = useRouter();
  return (
    <section className="relative mx-auto max-w-7xl px-6 py-24">
      <div className="bg-mesh relative overflow-hidden rounded-3xl border border-border/60 p-10 text-center sm:p-16">
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -top-16 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl"
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        <Reveal className="relative flex flex-col items-center gap-6">
          <Badge variant="secondary">
            <Zap className="h-3.5 w-3.5 text-primary" /> Start today
          </Badge>
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">
            Bring citation-backed intelligence to your research desk
          </h2>
          <p className="max-w-xl text-muted-foreground">
            Join teams turning official filings into defensible, visual analysis across markets.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" onClick={() => router.push("/dashboard")}>
              Get started free <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => router.push("/dashboard")}>
              Talk to sales
            </Button>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Gauge className="h-4 w-4 text-success" /> Try the full workspace with zero credit card.
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <main className="flex flex-1 flex-col">
      <Navbar />
      <Hero />
      <LogoMarquee />
      <Features />
      <HowItWorks />
      <Metrics />
      <LivePreview />
      <Pricing />
      <Testimonials />
      <FinalCTA />
      <Footer />
    </main>
  );
}