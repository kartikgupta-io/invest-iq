import { SkeletonCard } from "@/components/ui/loader";

/** Fallback that mirrors the final dashboard layout (no invented numbers). */
export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading live dashboard data" className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonCard className="h-7 w-64 border-0 bg-muted/60 p-0" />
          <SkeletonCard className="h-4 w-80 border-0 bg-muted/40 p-0" />
        </div>
        <SkeletonCard className="h-8 w-28 border-0 bg-muted/50 p-0" />
      </div>

      <SkeletonCard className="h-64" />

      <div>
        <SkeletonCard className="mb-3 h-5 w-40 border-0 bg-muted/50 p-0" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} className="h-20" />
          ))}
        </div>
      </div>

      <div>
        <SkeletonCard className="mb-3 h-5 w-48 border-0 bg-muted/50 p-0" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} className="h-20" />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} className="h-16" />
          ))}
        </div>
      </div>

      <SkeletonCard className="h-80" />
      <span className="sr-only">Loading live dashboard data…</span>
    </div>
  );
}
