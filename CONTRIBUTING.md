# Contributing to InvestIQ

Thanks for contributing. This document defines the development workflow so changes stay reviewable,
tested and consistent with the project's data-integrity rules.

## Non-negotiable rules

1. **Never invent data.** An unsourced field must be `null` / `—`, never a plausible-looking number
   or a stale fixture. New upstream sources must be documented in `docs/PRODUCT_DIRECTION.md`.
2. **Client data has one entry point.** Market data goes through `investiq/src/lib/data.ts` (SWR).
   Do not reintroduce React Query fixtures or component-level `fetch` calls for market data.
3. **The backend owns upstream access.** Yahoo Finance / Screener.in are only touched in
   `backend/app/data/live_sources.py`.
4. **Tests accompany behaviour changes.** New endpoints and parsers need offline tests (no network).

## Branches

| Branch | Purpose |
| --- | --- |
| `main` | Protected, always green. Releases are tagged here. |
| `feat/<short-name>` | New capability. |
| `fix/<short-name>` | Bug fix. |
| `chore/<short-name>` | Tooling, docs, dependencies. |

Create branches from the latest `main`:

```bash
git switch main
git pull --ff-only
git switch -c feat/my-feature
```

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(notifications): derive feed from live quotes
fix(sync): swap store after refresh so the next request is fresh
docs(sdlc): document branch protection
test(discovery): cover upstream failure fallback
chore(ci): cache bun dependencies
```

Keep commits focused; a pull request should be a coherent unit of work.

## Before opening a pull request

Run all gates locally — the same commands CI runs:

```bash
uv run pytest -q
bunx --cwd investiq tsc --noEmit
bun run --cwd investiq lint
bun run --cwd investiq build
```

Then push and open a PR against `main`. Reference the issue it closes and complete the PR template.

## Review expectations

- At least one approving review before merge.
- All CI checks green.
- No new static fixtures that present invented data as real.
- UI changes keep the grouped navigation, `—` formatting for missing values, and reduced-motion
  support intact.
- Destructive changes (schema, cache format, route removal) need a migration note in the PR.

## Reporting problems

Use the issue templates. For security issues, follow [SECURITY.md](SECURITY.md) instead of opening
a public issue.
