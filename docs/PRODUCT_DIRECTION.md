# Product direction — InvestIQ as a verifiable research workspace

## Positioning

InvestIQ is **not** a generic "AI finance dashboard". It is a **verifiable Indian equity research workspace** built on a single promise:

> Every number is sourced, every claim is citable, and anything we cannot source is shown as unavailable — never invented.

This correction was triggered by a user audit that found synthetic figures (SBIN ₹326.46, ₹29.15 lakh crore market cap, 108%-summing segments) being presented as real. The product direction below is the commitment that this cannot happen again.

## What is real (and where it comes from)

| Data | Source | Refresh |
| --- | --- | --- |
| Price, change, day/52-week range, volume | Yahoo Finance NSE chart API | on demand, 30-minute cache |
| Market cap, P/E, P/B, ROE, ROCE, dividend yield, book value | Screener.in consolidated page | on demand, 30-minute cache |
| 12-year P&L, balance sheet, cash flow, ratios | Screener.in consolidated tables | on demand, 30-minute cache |
| Ten headline index levels (NIFTY 50, SENSEX, NIFTY BANK, IT, Fin Services, Auto, Pharma, FMCG, Metal, Midcap 50) | Yahoo Finance | on demand, 60-second TTL, automatic client polling |
| Evidence snippets + links to annual reports | Screener.in commentary / issuer filings | on demand, 30-minute cache |

**Never presented as real:** historical segment mixes, filing hashes/page counts, unsourced 10-year valuation history, bank-inappropriate concepts (EBITDA, net debt, free cash flow for banks). These render as "—" or an explicit empty state.

## Derived stats (computed only from real inputs)

These are labelled as **derived**, not source values:

- revenue CAGR and net-profit CAGR across the real 12-year series
- net margin trend (`Net Profit / Revenue`)
- ROE trend from the real ratios table
- price change from real `price − previousClose`
- P/E and ROE comparison against real peer values

## Concrete use cases (the product's actual jobs)

1. **Check a quote** — real price, change, ranges, volume, source and as-of timestamp.
2. **Read fundamentals** — real market cap, P/E, P/B, ROE, ROCE, dividend yield, book value.
3. **Inspect 12 years of filings data** — real P&L, balance sheet, cash flow and ratios, with "—" for unavailable lines.
4. **Compare peers** — side-by-side on real P/E, ROE, market cap and margins.
5. **Find evidence** — deterministic BM25-style search over real harvested snippets, each linking to the original annual report.
6. **Ask AI with citations** — grounded synthesis over retrieved real evidence; the answer must cite the same sources the search returns.
7. **Trust the feed** — visible freshness/sync status on every data surface: source names, as-of time, stale/offline state.

## AI integration — one real path

Verified in this environment before committing:

- Chrome 158 is installed, but the **Prompt API (`window.LanguageModel`) is not exposed**, and the built-in **Summarizer model is not installed**. Neither can be relied on for a working demo here.
- **Apple Foundation Models are native-only** and are not callable from a web page, including Safari. There is no honest browser integration to build.
- **LM Studio is installed and running locally** with a real chat model (`qwen2.5-0.5b-instruct`). A generation request was verified end-to-end.

So the product has exactly one AI path: `POST /api/v1/ai-local/ask` retrieves real evidence from the live snapshot, builds a grounded prompt, and asks the local LM Studio model for an answer with `[n]` citations. `GET /api/v1/ai-local/status` reports the detected provider/model.

If no model is running, the endpoint still returns the retrieved sources with `available: false` and a clear reason. It never substitutes a template answer. No API key, no cloud dependency.

The same grounded path is available **while searching any security**: every company result has an "Ask AI" action that opens the research drawer scoped to that slug. `POST /api/v1/ai-local/ask` then harvests that company on demand (Yahoo quote, Screener fundamentals) and adds real Google News / NSE announcement / Wikipedia evidence when needed. When no server model is running, the drawer offers the opt-in in-browser model, grounded in exactly those retrieved, clickable sources. Evidence is never scoped to a different company.

## Market index freshness
Index levels are not part of the slow full-snapshot harvest: `/market/indices` re-fetches Yahoo when its own 60-second TTL expires, guarded by an in-process lock so many tabs cannot stampede the source. Each value carries both the exchange's market time (`asOf`) and InvestIQ's fetch time (`fetchedAt`), the source, and a `stale` flag. Missing values stay `null` and render as "—"; the synthetic `indices.json` fixture is deleted. Long-running servers additionally auto-harvest the full snapshot every five minutes; serverless relies on the on-demand index refresh and the explicit "Refresh now" button.

## Delivery principles (SWR / SSR / DOM)

- **SSR first paint**: dashboard, company, screener (`/screen`) and alerts (`/alerts`) pages fetch live data on the server (`force-dynamic` + `server-data.ts`) so real values are in the initial HTML — no loading flash on first paint.
- **SWR for hydration + revalidation**: `fallbackData` from SSR, deduping, focus revalidation, 60-second polling, `mutate()` on manual refresh. Client views (`*-view.tsx`) hydrate from the server payload, then keep it fresh.
- **Compressed page loads**: Next.js `compress: true` gzips rendered pages and static assets on `next start`; `poweredByHeader: false` drops the framework banner. The FastAPI backend adds `GZipMiddleware` (≥1 KB), so `/api/v1/companies` ships ~0.9 KB gzipped instead of ~3.1 KB raw.
- **Real sync, not a fake refresh**: "Refresh now" POSTs `/api/v1/freshness/refresh`, which re-harvests Yahoo Finance + Screener.in, writes the disk cache and swaps `app.state.store` in place — the next request serves the new snapshot with no process restart. The button only re-read the old cache before this fix.
- **Lazy upstream logos**: company icons load lazily from an issuer-domain allowlist verified to return a real favicon; any other domain (or a failed load) renders a coloured monogram instead of a broken grey globe.
- **Server snapshot boundary**: the backend is the only place that touches Yahoo/Screener; the browser never scrapes them directly.
- **Clever DOM**: semantic `<section>/<dl>/<dt>/<dd>/<table>/<time>`, `<details>` for provenance, `aria-live` for sync state, layout-matched skeletons, minimal client islands.

## Visual direction — cockpit UI

- **Light:** frosted glassmorphism panels (`.glass-panel`), soft shadows, near-white background.
- **Dark:** liquid glass — absolute near-black backdrop with restrained green/violet telemetry glow, 28px saturation-boosted blur and a specular top edge.
- **Green is the live signal:** a reusable status LED (`StatusLed`) marks fresh data, unread notifications and a ready local model. Amber = stale, grey = offline.
- **Bubbles, drawers, sidebars:** notification bubbles in the navbar, a right-side AI Research drawer with source cards, and the persistent sidebar for navigation.
- **Motion:** short `jump` hover/active transitions on interactive surfaces; no automatic layout shifts, so the UI always feels in control. `prefers-reduced-motion` is honoured globally.
- **Speed:** Server Components render the dashboard/company HTML with real values; SWR hydrates from that payload and revalidates in the background. No extra client bundle for the glass styling (CSS-only).

Inspired by Dexter's **transparent research scratchpad**: the AI drawer shows the actual steps (evidence retrieved → model used → cited answer) rather than presenting an opaque answer.

## Rebuilt data architecture & information map

- **One client data layer**: `src/lib/data.ts` is the only SWR surface; `src/lib/api.ts` is now a thin re-export. All React Query hooks, static-fixture fallbacks and invented user fixtures (`currentUser`, `defaultHoldings`, `defaultWatchlists`, `notifications`) were removed. The backend is the single source of truth for market data; user data lives in the local workspace.
- **Live-derived notifications**: `backend/app/data/notification_feed.py` builds the feed from real Yahoo quotes and the actual cache freshness state. A stale August-2026 fixture was deleted. Price moves carry the real `asOf`, value and source; the system item reports sync/stale/offline truthfully; local triggered price alerts are merged in the UI. `/notifications` is SSR with SWR hydration and grouped by deterministic UTC date.
- **Best-effort dynamic company discovery**: the built-in 12-company universe is no longer a hard ceiling. `GET /api/v1/live/discover?q=` first answers from local coverage, then falls back to Yahoo's keyless symbol search, fetching one real quote for the best Indian equity and caching results on disk (bounded at 40). Unknown companies become queryable through `/companies?q=` and `/company/{slug}` immediately. Upstream failure returns an empty result with an `error` — never a guessed company. The UI labels this as "Best-effort external lookup" and shows `—` for fields that could not be sourced.
- **Remapped navigation**: `src/lib/navigation.ts` defines one grouped IA (Overview / Research / Track + Workspace), shared by the desktop sidebar and the mobile drawer, so the site map stays consistent at every breakpoint.
- **Modular UI kit**: reusable `PageHeader`, `StatTile`, `SegmentedControl`, `NotificationCard`, `ToastProvider` and `EmptyState` primitives, with toasts wired into sync and add-holding flows. Holdings are now user-added (with live price overlay) rather than seeded with fabricated positions.

## Typography & accessibility

- **Cohesive three-role type system**: Space Grotesk for display, Plus Jakarta Sans for dense UI, JetBrains Mono for figures. One distinctive voice across every page instead of mismatched defaults.
- **Contrast-safe monograms**: `readableTextOn()` computes relative luminance so text flips between dark and light against any brand colour; the mobile logo gradient uses a dark emerald→teal ramp. Fixes the Lighthouse contrast failures on colour-tiled monograms.

## Verification contract

- Backend: `pytest -q`, with tests asserting no synthetic value leaks into `/companies/*`.
- Frontend: `tsc --noEmit`, `eslint` 0 errors, `next build`.
- Browser: CDP assertions that `/dashboard` and `/companies/state-bank-of-india` show the real SBIN price (~₹1,165), real market cap (~₹10.74 lakh crore), a visible sync panel, and **no** `326.46` / `29.15` / 108% segments.
- AI: the answer panel either returns a cited answer generated by a detected real model, or an explicit unavailable state — never a canned response.
