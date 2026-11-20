import { Suspense } from "react";
import {
  getServerCompanies,
  getServerFreshness,
  getServerIndices,
  getServerLiveStatus,
} from "@/lib/server-data";
import { DashboardSkeleton } from "./dashboard-skeleton";
import { DashboardView } from "./dashboard-view";

/** True SSR: fresh data from the backend on every request, no mock fallbacks. */
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [companies, indices, freshness, liveStatus] = await Promise.all([
    getServerCompanies(),
    getServerIndices(),
    getServerFreshness(),
    getServerLiveStatus(),
  ]);

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardView initial={{ companies, indices, freshness, liveStatus }} />
    </Suspense>
  );
}
