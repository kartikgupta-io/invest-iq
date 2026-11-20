# SDLC — Software Development Lifecycle

This repository follows a lightweight, PR-driven SDLC. The goal is small, reviewable changes that
are automatically verified, with a protected `main` branch and clear release points.

## Lifecycle

```
issue → branch → implement + test → PR → CI + review → squash merge to main → tag release
```

1. **Plan** — bugs and features start as GitHub issues using the issue templates. Acceptance
   criteria include the data-integrity rule: sourced values only, `null` / `—` otherwise.
2. **Branch** — `feat/*`, `fix/*`, `chore/*` from latest `main` (see `CONTRIBUTING.md`).
3. **Implement** — keep changes additive where possible; preserve existing pages and tests. New
   backend behaviour needs offline tests; new UI needs to reuse the modular component kit.
4. **Verify** — run the four local gates before pushing. CI repeats them for every push and PR.
5. **Review** — one approval, all checks green, no unresolved review threads.
6. **Merge** — squash merge into `main` so each change is one atomic commit.
7. **Release** — tag `v0.x.y` from `main`; note the change in the release description.

## Branch protection (recommended repository settings)

Configure on GitHub → Settings → Branches → Protection rule for `main`:

- Require a pull request before merging, with **1 required approval**.
- Dismiss stale approvals when new commits are pushed.
- Require status checks: `backend (pytest)` and `frontend (typecheck / lint / build)`.
- Require branches to be up to date before merging.
- Require signed commits where the team supports it.
- Do not allow bypassing the above settings (including for admins, once the team is ready).

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request:

| Job | Commands |
| --- | --- |
| `backend` | `uv sync --frozen`, `uv run pytest -q` |
| `frontend` | `bun install --frozen-lockfile`, `bun run typecheck`, `bun run lint`, `bun run build` |

The workflow is concurrency-limited per branch/ref so superseded runs are cancelled. Lockfiles
(`uv.lock`, `investiq/bun.lock`) are committed and must be updated in the same PR as dependency
changes.

## Dependency management

- `dependabot.yml` proposes weekly updates for GitHub Actions, Python and Bun dependencies.
- Dependency PRs must pass the same gates; review them like any other change.
- Never hand-edit lockfiles — regenerate with `uv lock` / `bun install`.

## Definition of done

- [ ] Acceptance criteria met; no fabricated data introduced.
- [ ] Offline tests added/updated; backend suite green.
- [ ] `tsc`, `lint`, `build` green; no new console errors in a browser spot-check.
- [ ] Docs updated (`README.md`, `docs/PRODUCT_DIRECTION.md`) when behaviour changes.
- [ ] PR template complete; review approved; CI green; squashed into `main`.
- [ ] Version tag created for user-visible releases.

## Security

Non-production by design. Do not expose the API publicly without the hardening in
`docs/SDLC_SECOPS_REPORT.md`. Report vulnerabilities privately per `SECURITY.md`.
