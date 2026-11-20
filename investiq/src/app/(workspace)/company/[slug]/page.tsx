import { Suspense } from "react";
import { getServerCompany, getServerFreshness, getServerLiveStatus } from "@/lib/server-data";
import { CompanyDetailSkeleton } from "./company-detail-skeleton";
import { CompanyDetailView } from "./company-detail-view";

/** True SSR: the company payload is fetched from the backend on every request. */
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [company, freshness, liveStatus] = await Promise.all([
    getServerCompany(slug),
    getServerFreshness(),
    getServerLiveStatus(),
  ]);

  return (
    <Suspense fallback={<CompanyDetailSkeleton />}>
      <CompanyDetailView slug={slug} initial={{ company, freshness, liveStatus }} />
    </Suspense>
  );
}
