import {
  Activity,
  BellRing,
  Briefcase,
  LayoutDashboard,
  LifeBuoy,
  ListFilter,
  Search,
  Settings,
  Sparkles,
  Star,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export type NavLink = { href: string; label: string; icon: LucideIcon; hint?: string };
export type NavGroup = { label: string; items: NavLink[] };

/** One information architecture, reused by the sidebar and the mobile drawer. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/demo", label: "Live market", icon: Activity, hint: "Real quotes & evidence" },
    ],
  },
  {
    label: "Research",
    items: [
      { href: "/screen", label: "Screener", icon: ListFilter },
      { href: "/search", label: "Discover", icon: Search },
      { href: "/ai", label: "AI Research", icon: Sparkles },
    ],
  },
  {
    label: "Track",
    items: [
      { href: "/watchlists", label: "Watchlists", icon: Star },
      { href: "/alerts", label: "Price Alerts", icon: BellRing },
      { href: "/portfolio", label: "Portfolio", icon: Briefcase },
    ],
  },
];

export const WORKSPACE_LINKS: NavLink[] = [
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help Center", icon: LifeBuoy },
];

export const ALL_NAV_LINKS: NavLink[] = [
  ...NAV_GROUPS.flatMap((group) => group.items),
  ...WORKSPACE_LINKS,
];

export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
