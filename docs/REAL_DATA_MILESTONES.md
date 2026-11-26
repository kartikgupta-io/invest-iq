# Real-Data Transformation — Plan, Milestones & Verification

Status: **IN PROGRESS** — updated as each gate passes.

## 0. Think / refine (idea-refine applied)

**Vague input:** "replace stale mock data, make a working complete project with real data, working USP and a demo; plan, decompose, search, analyse, refactor, review, replan, delete, track milestones and verification."

**Sharp goal:** Make InvestIQ demonstrably real: live quotes and fundamentals from public sources, a cited evidence-search USP over real harvested text, a single guided demo that proves the whole flow, and removal of the stale fabricated corpus — with every milestone gated by an executable check.

## 1. Search & analyse (completed)

| Source | Verified | Used for |
| --- | --- | --- |
| `query1.finance.yahoo.com/v8/finance/chart/{TICKER}.NS` | ✅ live 20-Nov-2026 quote for RELIANCE | real prices, ranges, volume, history |
| `screener.in/company/{SYMBOL}/consolidated/` | ✅ live ratios, about, pros/cons, citation links | real fundamentals + real PDF citations |
| `data.sec.gov/api/xbrl/...` | ✅ reachable | optional US extension, not in demo scope |
| `stooq.com` | ❌ no response | rejected |

Analysis conclusion: the existing app's data is synthetic and dated (fixture mtime Aug 2026). The fastest honest path is a new live-source subsystem plus a real snapshot, not a rewrite of the whole UI.

## 2. Decompose (work breakdown)

- **M1** Real-source adapters + cache (`live_sources.py`) — parsing, TTL disk cache, evidence builder, deterministic BM25 search.
- **M2** Live API (`/api/v1/live/*`) + refresh script — status, quote, profile, search, compare.
- **M3** Demo UI (`/(workspace)/demo`) — live quote → real fundamentals → cited evidence search → peer comparison.
- **M4** Refactor/review — wire nav, honest FAQ and marketing copy; fix lint/types/build regressions.
- **M5** Delete stale artifacts — fabricated fixtures/testimonials/metrics once M1–M4 pass; keep only a real cached snapshot.
- **M6** Verification — tests, typecheck, lint, build, live end-to-end, browser console check.

## 3. Milestone tracker

| # | Milestone | Exit check | Status |
| --- | --- | --- | --- |
| M1 | Live adapters, parser, cache, BM25 search | parsers + deterministic search covered by 7 new tests | ✅ |
| M2 | `/api/v1/live/{status,quote,profile,search,compare}` + `refresh_data.py` | all endpoints 200; real snapshot `savedAt` 2026-11-20, 11 companies, 79 evidence snippets | ✅ |
| M3 | `/demo` page + nav + CTA | browser check: real ₹1,377.50 quote, source labels, 0 console errors | ✅ |
| M4 | Review/refactor: copy, FAQ, lint/types | `tsc` clean; ESLint 0 errors; production build passes | ✅ |
| M5 | Delete stale mock generators & fake marketing data | synthetic fixture generator deleted; fake testimonials/logos/metrics removed | ✅ (legacy fixture payload retained — see R3) |
| M6 | End-to-end verification | 31 backend tests pass; build passes; live endpoints 200; CDP 0 errors | ✅ |

## 3c. LIVE MARKET DATA + SECURITY AI — 26-Nov-2026

| # | Milestone | Exit check | Status |
| --- | --- | --- | --- |
| M11 | Accurate, self-refreshing indices | `/market/indices` re-harvests Yahoo when its 60s TTL expires; 10 real headline indices carry `asOf`, `fetchedAt`, `source`, `stale`; synthetic `indices.json` deleted; 69 backend tests green | ✅ |
| M12 | Automatic + manual refresh | Backend lifespan auto-harvests every 300s (configurable); SWR polls indices every 30s; "Refresh now" still forces a full harvest via `/freshness/refresh` | ✅ |
| M13 | Any Indian security + cited AI while searching | NSE-wide local discovery (2,643 listings), foreign tickers rejected; "Ask AI" on every search result scopes `/ai-local/ask` to that company and harvests on-demand Screener + Google News/NSE/Wikipedia evidence; in-browser model fallback renders cited answers when no server model is running | ✅ |

**Bugs fixed during this pass:** cached index payloads were six days old and rendered as live; `MarketIndex` had no provenance; missing index values were fabricated as `0.0`; a dividend payout with no EPS crashed company discovery for JIOFIN; 12 foreign tickers from a discovery test polluted the cache.

## 3b. ACCURACY CORRECTION — user review found M5/M6 claims were overstated (20-Nov-2026)

**User finding (verbatim essence):** the `/companies/state-bank-of-india` page shows SBIN at ₹326.46, market cap ₹29.15 lakh crore, FY2026 net income ₹2.08 lakh crore, and segment shares summing to 108% — none of which match reality (real price ≈ ₹1,165.10, market cap ≈ ₹10.75 lakh crore, net profit ≈ ₹0.80–0.85 lakh crore). The dashboard shows no visible data sync/freshness status and silently falls back to local mock fixtures.

**Root cause confirmed:** M1–M6 only changed `/demo` and `/api/v1/live/*`. The rest of the app (`/companies/*`, `/dashboard`, `/discover`, `/watchlists`) still read the checked-in synthetic fixture corpus (`backend/app/fixtures/companies/*.json`), whose numbers were never real. The navbar freshness badge was mounted but only reported legacy-fixture mtime, so it showed "Data offline"/"stale" with no source detail, and it was hidden on mobile.

**Correction milestones** (tracked separately; the earlier M1–M6 table must not be read as "the whole app is real"):

| # | Milestone | Exit check | Status |
| --- | --- | --- | --- |
| M7 | Harvest REAL annual financials + indices into the live snapshot | 12 FY years + real indices cached; 53 backend tests green | ✅ |
| M8 | Reconcile `/companies/*`, `/market/indices`, `/freshness` to real snapshot data | HTTP verified: SBIN ₹1,165.10, ₹10.74 L cr, FY26 net ₹86,666 cr; unsourced fields `null` | ✅ |
| M9 | SWR + SSR + client caching; visible freshness/sync panel on dashboard & company pages | `tsc` clean, ESLint 0 errors, build passes; SSR HTML contains real values | ✅ |
| M10 | End-to-end re-verification against the user's exact complaint | CDP: dashboard + `/company/state-bank-of-india` show real figures, sync panel, no fake values; notifications relative; AI drawer generates cited answer | ✅ |

**Accuracy bugs caught and fixed during M10 verification:** (1) `_element_text()` ignored nested `<button>` text, silently dropping Revenue/Net Profit/cash-flow rows; (2) Yahoo `chartPreviousClose` is the range-start close, not the prior day — now uses the penultimate daily close (₹1,156 for SBIN); (3) the live snapshot was being overwritten by a stale server process — restart after refresh is required.

**Design rules for this correction:** no fabricated numbers; every unsourced field becomes `null` and renders as "—"; derived values (growth, margin, change) are computed only from real inputs and documented; segments are dropped rather than faked; fake filing URLs/hashes/pages are removed in favour of real citation links.

## 4. Verification checks (run at every gate)

```bash
# backend
.venv/Scripts/python.exe -m pytest -q
.venv/Scripts/python.exe -m scripts.refresh_data   # from backend/

# frontend
bunx tsc --noEmit          # from investiq/
bun run lint
bun run build

# live E2E
curl http://localhost:8000/api/v1/live/status
curl http://localhost:8000/api/v1/live/quote/RELIANCE
curl -X POST http://localhost:8000/api/v1/live/search -H "Content-Type: application/json" -d '{"query":"Jio retail annual report"}'
```

## 5. Review / replan log

- **R1 (initial):** Plan assumed full `DataStore` replacement. **Replanned** to additive live subsystem — lower blast radius, preserves 24 passing tests and all existing pages while still delivering real data where it matters.
- **R2 (done):** Screener HTML parsing confirmed against live markup; real ratios, pros/cons and a real annual-report PDF citation were extracted. Yahoo/Screener both returned 200 from the app runtime with a proper User-Agent.
- **R3 (review result):** the live demo and `/api/v1/live/*` contain **no fabricated values** — missing fields are `null`, failures surface as stale/error states. The older `/api/v1/companies/*` pages still read the checked-in legacy fixture payloads because their rich Pydantic contract (10-year statements, segments, quarterly data) cannot be honestly reconstructed from the available public sources. These are now explicitly **legacy demo data**, not presented as real in the demo. Tata Motors is temporarily absent from the live snapshot because both sources returned 404 for it; it is served from stale cache when available rather than invented. Full replacement of the legacy payload would require a new data provider (e.g. paid fundamentals API) — deferred, not hidden.

## 6. Deletion ledger (M5)

| Artifact | Reason | Status |
| --- | --- | --- |
| `backend/app/fixtures/companies/*.json` (synthetic) | legacy payload retained only for backward-compatible pages (see R3) | ⬜ deferred — needs a real fundamentals provider |
| `backend/app/fixtures/chunks.json` (synthetic) | legacy chunks retained for the old `/search` route | ⬜ deferred |
| `backend/app/fixtures/build.py` (synthetic generator) | source of stale mock data — deleted | ✅ |
| Landing-page testimonials / trust logos / fake metrics | unverifiable marketing claims — replaced with real source names, capability facts and honest counts | ✅ |
| `main.py` root hello-world | dead scaffolding — deleted | ✅ |
| duplicate AI engines / unrouted reports module | dead code (needs product sign-off) | ⬜ deferred |
