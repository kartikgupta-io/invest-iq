## Summary

<!-- What changed and why? Link the issue: Closes #123 -->

## Type of change

- [ ] Feature
- [ ] Bug fix
- [ ] Docs / tooling
- [ ] Refactor (no behaviour change)

## Data integrity

- [ ] No invented values; unsourced fields remain `null` / `—`
- [ ] New upstream source documented in `docs/PRODUCT_DIRECTION.md`
- [ ] Offline tests added for new backend behaviour

## Verification

- [ ] `uv run pytest -q`
- [ ] `bunx --cwd investiq tsc --noEmit`
- [ ] `bun run --cwd investiq lint`
- [ ] `bun run --cwd investiq build`
- [ ] Browser spot-check (no console errors, freshness/UI states correct)

## Checklist

- [ ] Self-reviewed the diff
- [ ] Docs updated where behaviour changed
- [ ] No secrets or credentials committed
