import { Suspense } from "react";
import { SkeletonCard } from "@/components/ui/loader";
import { getServerCompanies, getServerFreshness } from "@/lib/server-data";
import { ScreenView } from "./screen-view";

/** True SSR: live companies and freshness are fetched on every request. */
export const dynamic = "force-dynamic";

export default async function ScreenPage() {
  const [companies, freshness] = await Promise.all([
    getServerCompanies(),
    getServerFreshness(),
  ]);

  return (
    <Suspense fallback={<SkeletonCard className="h-96" />}>
      <ScreenView initial={{ companies, freshness }} />
    </Suspense>
  );
}
