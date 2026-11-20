# SDLC & SecOps Report — InvestIQ

Date: 2026-11-20. Scope: `backend/` (FastAPI) and `investiq/` (Next.js 16).
Method: read-only source review plus automated checks and fix/verify loops.
All source under `.venv/`, `node_modules/` and lockfiles was excluded from manual review.

## 1. Executive summary

The project is a coherent prototype: a clean `DataStore` boundary, a shared
Pydantic/TypeScript payload contract, 23 passing backend tests and a genuinely
working offline fallback design. The highest-risk issues are **process gaps**
(no CI, empty documentation, no frontend typecheck/test) and **security design
gaps** (no authentication, no rate limiting). No secrets, injection sinks,
path traversal or dangerous deserialization were found in first-party code.

## 2. SDLC findings and disposition

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| S1 | High | Empty root `README.md`; no setup/run/test documentation | **Fixed** — new README covering install, run, env, quality checks |
| S2 | High | Frontend called routes that do not exist (`/markets/indices`, `/me`, `/me/notifications`, `/portfolio/holdings`) behind silent fallbacks | **Fixed** — typos corrected; profile/holdings made explicitly local-only; API failures now visible via freshness badge |
| S3 | High | Ruff configured in `pyproject.toml` but not installable/runnable | **Open** — use `uvx ruff check backend`; add to dev deps in next dependency pass |
| S4 | Medium | No CI, no root `.gitignore`, no build automation | **Fixed** — `.github/workflows/ci.yml`, root `.gitignore` |
| S5 | Medium | Test isolation leaks cached singletons (`get_llm`, `app.main._store`) | **Open** — use monkeypatch + cache reset fixtures |
| S6 | Medium | Coverage gaps (watchlists, notifications, market, chunks, workers, ingest) | **Partial** — freshness endpoint test added; broader smoke tests remain |
| S7 | Medium | Two parallel AI stacks and an unrouted 417-line reports module | **Open** — deliberate no-delete decision; needs product decision before removal |
| S8 | Medium | Broad `except Exception: pass` hides failures | **Open** — add structured logging at trust boundaries |
| S9 | Medium | Frontend semantic search used `Math.random()` and never called `/search` | **Fixed** — `apiPost('/search')` with deterministic local fallback |
| S10 | Medium | 900 ms API timeout caused false offline fallbacks | **Fixed** — raised to 5 s |
| S11 | Medium | Unused dependencies in both manifests | **Open** — requires lockfile regeneration; not done to avoid churn |
| S12 | Medium | No frontend typecheck script | **Fixed** — `bun run typecheck`; wired into CI |
| S13 | Low | Minimal health endpoint; no `.env.example` | **Partial** — new `/freshness` endpoint, UI badge and `.env.example`; deeper readiness checks remain |
| S14 | Low | Dead scaffolding (`main.py` hello-world, empty dirs, unused types) | **Open** — cosmetic cleanup |
| S15 | Low | `next/font/google` needs network at build time | **Open** — document egress or self-host fonts |

## 3. SecOps findings and disposition

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| C1 | High | **No authentication or authorization.** All 8 routers are anonymous; user-shaped data is one global fixture | **Open — accepted prototype risk.** Add `HTTPBearer` + `get_current_user` before any real data or write endpoint |
| C2 | Medium | Unauthenticated LLM cost/CPU exhaustion; unbounded `question` and `symbols` | **Partial** — `question` capped at 2000 chars, symbols capped at 10, query at 200; per-IP rate limiting still required |
| C3 | Medium | Conversation memory keyed by client-supplied `session_id` with no ownership check | **Open** — bind sessions to authenticated user; ignore client-supplied IDs once auth lands |
| C4 | Medium | CORS `allow_credentials=True` with wildcard risk if env is misconfigured | **Fixed** — `Settings` rejects `"*"` in `cors_origins` |
| C5 | Medium | No HTTP security headers or TrustedHost middleware | **Fixed (partial)** — `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` added; TrustedHost deferred to deployment config |
| C6 | Low/Med | `.env` not ignored at repo root | **Fixed** — root `.gitignore` with `.env*`, keys and certs |
| C7 | Low | Unbounded query params, missing `response_model` on AI routes | **Partial** — bounds added; response models remain |
| C8 | Low | Ingest URLs interpolate symbols with redirects followed | **Open** — not reachable from HTTP today; URL-encode/allowlist before wiring Celery tasks to the API |
| C9 | Low | `slug` interpolated into frontend fetch paths without encoding; `sourceUrl` used directly as `href` | **Open** — fixtures are trusted; add `encodeURIComponent` and `https:` allowlist |
| C10 | Low | Financial watchlist/holdings persisted in plaintext localStorage | **Open** — synthetic data only; clear on logout once auth exists |

**Checked and clean:** no hardcoded secrets, no `eval`/`exec`/`shell=True`/`pickle`,
no path traversal (slugs are dict lookups, not filesystem paths), no SQL built
from input, TLS verification enabled with timeouts on all external HTTP calls,
no `dangerouslySetInnerHTML` or third-party scripts in the frontend.

## 4. Fix loops executed

1. **Crash loop** — reproduced `Cannot read properties of undefined (reading
   'length')` via CDP with stale `localStorage`. Root cause: persisted Zustand
   watchlists missing `symbols`. Fixed by sanitizing all four persisted stores
   on rehydrate plus defensive reads in sidebar, dashboard and watchlists.
   Re-verified with the same malformed payload — error no longer occurs.
2. **Integration loop** — corrected API paths, added `POST /search` usage and a
   5 s timeout; added `GET /freshness`, its test and the navbar badge.
3. **Identity loop** — replaced the fictional `Aarav Sharma` account with
   `Admin` / `admin@investiq.ai` / Administrator, and fixed the stale
   "Bloomberg Pro" workspace title.
4. **Basics loop** — README, `.env.example`, root `.gitignore`, CI workflow,
   `typecheck` script and backend CORS/header/input hardening.
5. **Verification loop** — pytest, TypeScript, ESLint and production build;
   results recorded below.

## 5. Verification results

- `pytest -q` — **24 passed** (1 upstream Starlette/httpx deprecation warning).
- `tsc --noEmit` — **clean**.
- `eslint` — **0 errors**, 22 warnings (all unused-symbol warnings in untouched modules).
- `next build` — **success**, 24 routes generated, TypeScript pass clean.
- Live API — `/api/v1/health` 200 with security headers; `/api/v1/freshness` 200
  reporting `stale` (fixture mtime Aug 2026 vs current date), proving the
  freshness signal works rather than always reporting green.
- Live UI — `/` 200; CDP replay of the malformed `localStorage` payload that
  previously crashed `Sidebar` now produces **0 exceptions**.
- Both dev servers running: web `http://localhost:3000`, API `http://localhost:8000`.
