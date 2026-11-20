/**
 * Backwards-compatible import surface.
 *
 * All data access now lives in `lib/data.ts` — one SWR-based layer backed by
 * the live API. This re-export keeps existing imports working while ensuring
 * there is exactly one source of truth for the UI.
 */
export * from "./data";
