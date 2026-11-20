import type { ReactNode } from "react";
import { CompanyNav } from "@/components/company/company-nav";

export default async function CompanyLayout({ params, children }: { params: Promise<{ slug: string }>; children: ReactNode }) {
  const { slug } = await params;
  return (
    <div className="space-y-6">
      <CompanyNav slug={slug} />
      <div className="mx-auto max-w-7xl">{children}</div>
    </div>
  );
}