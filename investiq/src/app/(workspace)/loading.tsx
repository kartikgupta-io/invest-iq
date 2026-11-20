import { SkeletonCard } from "@/components/ui/loader";

export default function WorkspaceLoading() {
  return (
    <div className="space-y-6">
      <SkeletonCard className="h-16 w-full" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} className="h-28" />)}
      </div>
      <SkeletonCard className="h-80" />
    </div>
  );
}