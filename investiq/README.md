# InvestIQ Web

Next.js 16 (App Router, Turbopack) workspace for the InvestIQ API.

```bash
bun install
bun run dev        # http://localhost:3000
bun run typecheck  # tsc --noEmit
bun run lint       # eslint
bun run build      # production build
```

The API base URL comes from `NEXT_PUBLIC_API_URL` (default
`http://localhost:8000/api/v1`). When the API is unavailable, the UI falls
back to bundled fixtures and the navbar freshness badge shows "Data offline".

See the [root README](../README.md) for full setup and the
[SDLC & SecOps report](../docs/SDLC_SECOPS_REPORT.md) for security posture.
