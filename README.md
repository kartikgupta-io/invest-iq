# InvestIQ — Financial Intelligence Platform

InvestIQ is an Indian-equity research workspace built on **real public data**. It combines a
FastAPI research API (Yahoo Finance quotes + Screener.in fundamentals, with a disk cache) and a
Next.js 16 cockpit UI with server-rendered first paint, SWR hydration, and a grounded local AI
research drawer.

> **Data contract:** a value that cannot be sourced is `null` / `—`, never invented. Prices,
> fundamentals, notifications and discovered companies all carry their real source and timestamp.

## Stack

| Part | Location | Runtime | Key libraries |
| --- | --- | --- | --- |
| API | `backend/` | Python 3.14 (`uv`) | FastAPI, Pydantic v2, httpx, celery |
| Web | `investiq/` | Bun 1.3 | Next.js 16 (App Router), React 19, SWR, ECharts, Tailwind 4 |

## Features

- **Live research** — NSE quotes, indices, fundamentals, annual statements, ratios, pros/cons and
  citations, with a visible freshness panel and a real `Refresh now` harvest.
- **Dynamic discovery** — companies outside the built-in universe are resolved best-effort from
  Yahoo's keyless symbol search, cached on disk (bounded), and become queryable immediately.
- **Screener & alerts** — live filters, saved views, CSV export, and price alerts evaluated against
  live quotes; triggered alerts appear in the notification feed.
- **Local workspace** — accounts, screens, alerts, notes, preferences and holdings are stored in
  this browser only (no server-side authentication is claimed).
- **Grounded local AI** — LM Studio OpenAI-compatible endpoint; answers are generated from retrieved
  evidence and returned with sources, or an explicit `available: false` state.
- **Cockpit UI** — glassmorphism in light, liquid glass in dark, green live LEDs, grouped navigation,
  reusable modular primitives, and Space Grotesk / Plus Jakarta Sans / JetBrains Mono typography.

## Quick start

```bash
# 1. API — from the repository root
uv sync
uv run uvicorn app.main:app --app-dir backend --reload --port 8000

# 2. Web — second terminal
cd investiq
bun install
bun run dev          # http://localhost:3000
```

Set `NEXT_PUBLIC_API_URL` in `investiq/.env.local` if the API is not at
`http://localhost:8000/api/v1`. Copy `.env.example` for backend configuration.

Useful URLs: web `http://localhost:3000`, demo `http://localhost:3000/demo`,
API docs `http://localhost:8000/docs`, freshness `GET /api/v1/freshness`,
live status `GET /api/v1/live/status`.

Refresh the live snapshot from the CLI (the UI's `Refresh now` does this over HTTP):

```bash
cd backend && ../.venv/Scripts/python.exe -m scripts.refresh_data
```

## Architecture

```
backend/app/
  api/v1/            # FastAPI routers (companies, live, freshness, notifications, ai…)
  data/
    live_sources.py      # upstream harvest, parsing, disk cache, discovery
    notification_feed.py # feed derived from real quotes + freshness state
    offline.py           # store construction + live reconciliation
    reconcile.py         # maps sourced fields onto the Company contract (null-safe)
frontend → investiq/src/
  lib/data.ts          # single SWR data layer (no mock fallbacks)
  lib/server-data.ts   # per-request SSR fetches
  lib/navigation.ts    # one grouped site map for sidebar + mobile drawer
  components/ui/       # reusable primitives (Card, DataTable, Toast, StatTile…)
  app/(workspace)/     # dashboard, company, screener, alerts, notifications…
```

The browser never scrapes upstream sources; the backend owns that boundary. Market data pages
render on the server (`force-dynamic`) and hydrate through SWR with `fallbackData`.

## Quality checks

```bash
uv run pytest -q                            # backend tests (63)
bunx --cwd investiq tsc --noEmit            # strict TypeScript
bun run --cwd investiq lint                 # ESLint (0 errors expected)
bun run --cwd investiq build                # production build
```

CI runs the same gates on every push and pull request — see `.github/workflows/ci.yml`.
Branching, commit and release conventions are documented in [CONTRIBUTING.md](CONTRIBUTING.md)
and [docs/SDLC.md](docs/SDLC.md).

## Security posture

This is a development prototype: the local workspace is browser-only, there is no server-side
authentication, rate limiting, or user-bound session ownership. Do not expose the API publicly
without the hardening listed in [docs/SDLC_SECOPS_REPORT.md](docs/SDLC_SECOPS_REPORT.md).
Secrets are intentionally absent from the repository.

## License

[MIT](LICENSE)
