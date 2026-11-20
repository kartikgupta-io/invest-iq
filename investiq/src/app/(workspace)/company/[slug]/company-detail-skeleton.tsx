import { SkeletonCard } from "@/components/ui/loader";

/** Layout-matched fallback for the server-rendered company overview. */
export function CompanyDetailSkeleton() {
  return (
    <div role="status" aria-label="Loading live company data" className="space-y-6">
      <SkeletonCard className="h-44" />
      <SkeletonCard className="h-56" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} className="h-24" />
        ))}
      </div>
      <SkeletonCard className="h-72" />
      <div className="grid gap-6 lg:grid-cols-2">
        <SkeletonCard className="h-64" />
        <SkeletonCard className="h-64" />
      </div>
      <SkeletonCard className="h-48" />
      <span className="sr-only">Loading live company data…</span>
    </div>
  );
}
