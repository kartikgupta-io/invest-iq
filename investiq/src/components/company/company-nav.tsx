"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, FileText, Sparkles, LayoutGrid, Wallet, TrendingUp, Percent, Activity, Scale, Gauge, BadgeIndianRupee, ChartLine, Boxes } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompany } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

const TABS = [
  { href: "", label: "Overview", icon: LayoutGrid },
  { href: "/financials", label: "Financials", icon: Boxes },
  { href: "/revenue", label: "Revenue", icon: TrendingUp },
  { href: "/profit", label: "Profit", icon: Wallet },
  { href: "/margins", label: "Margins", icon: Percent },
  { href: "/cash-flow", label: "Cash Flow", icon: Activity },
  { href: "/debt", label: "Debt", icon: Scale },
  { href: "/roe", label: "ROE", icon: Gauge },
  { href: "/roce", label: "ROCE", icon: Gauge },
  { href: "/eps", label: "EPS", icon: BadgeIndianRupee },
  { href: "/valuation", label: "Valuation", icon: ChartLine },
  { href: "/market-cap", label: "Market Cap", icon: ChartLine },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/ai", label: "AI Research", icon: Sparkles },
];

export function CompanyNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const { data: company } = useCompany(slug);
  const active = TABS.find((t) => pathname === `/company/${slug}${t.href}` || (t.href && pathname.startsWith(`/company/${slug}${t.href}`)))?.href ?? "";

  return (
    <div className="sticky top-14 z-30 -mx-4 border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex items-center gap-2 overflow-x-auto py-1.5">
        <span className="mr-1 flex shrink-0 items-center gap-1.5 text-sm font-semibold">
          <Building2 className="h-4 w-4" style={{ color: company?.profile.accent }} />
          {company ? company.profile.ticker : <Skeleton className="h-4 w-14" />}
        </span>
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={`/company/${slug}${t.href}`}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
              active === t.href && "bg-primary/10 text-primary",
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}