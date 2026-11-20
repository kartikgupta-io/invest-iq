import { Suspense } from "react";
import { SkeletonCard } from "@/components/ui/loader";
import { getServerCompanies } from "@/lib/server-data";
import { AlertsView } from "./alerts-view";

/** True SSR: the live company universe is fetched on every request. */
export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const companies = await getServerCompanies();

  return (
    <Suspense fallback={<SkeletonCard className="h-96" />}>
      <AlertsView initial={{ companies }} />
    </Suspense>
  );
}
