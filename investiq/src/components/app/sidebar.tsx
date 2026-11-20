"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useUiStore, useWatchlistStore } from "@/store";
import { useAllCompanySlugs, useCompany } from "@/lib/api";
import { colorFromSlug } from "@/data/account";
import { NAV_GROUPS, WORKSPACE_LINKS, isNavActive, type NavLink } from "@/lib/navigation";
import { BrandMark } from "./brand-mark";

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed } = useUiStore();
  const watchlists = useWatchlistStore((s) => s.watchlists);
  const { data: slugs = [] } = useAllCompanySlugs();
  const collapsed = sidebarCollapsed;

  return (
    <aside
      className={cn(
        "glass-panel sticky top-0 hidden h-screen flex-col border-y-0 border-l-0 lg:flex",
        collapsed ? "w-[76px]" : "w-[248px]",
      )}
    >
      <Link href="/" className={cn("flex items-center gap-2.5 px-5 py-5", collapsed && "justify-center px-0")}>
        <BrandMark className="h-8 w-8 drop-shadow-[0_0_10px_var(--led-halo)]" />
        {!collapsed && (
          <span className="font-display text-base font-bold tracking-tight">
            InvestIQ <span className="text-gradient">AI</span>
          </span>
        )}
      </Link>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavItem
                  key={item.href}
                  {...item}
                  active={isNavActive(pathname, item.href)}
                  collapsed={collapsed}
                />
              ))}
            </div>
          </div>
        ))}

        {!collapsed && watchlists.length > 0 && (
          <div>
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
              Your lists
            </p>
            <div className="space-y-0.5">
              {watchlists.slice(0, 3).map((list) => (
                <Link
                  key={list.id}
                  href={`/watchlists?list=${list.id}`}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: list.color }} />
                  <span className="flex-1 truncate">{list.name}</span>
                  <span className="text-xs tabular-nums">{list.symbols?.length ?? 0}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>

      <div className="space-y-0.5 border-t border-border/60 p-3">
        {!collapsed && <CompanyShortcuts slugs={slugs.slice(0, 2)} current={pathname} />}
        {WORKSPACE_LINKS.map((item) => (
          <NavItem
            key={item.href}
            {...item}
            active={isNavActive(pathname, item.href)}
            collapsed={collapsed}
          />
        ))}
      </div>
    </aside>
  );
}

function CompanyShortcuts({ slugs, current }: { slugs: string[]; current: string }) {
  if (!slugs.length) return null;
  return (
    <div className="space-y-0.5 pb-2">
      <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
        Tracked
      </p>
      {slugs.map((slug) => (
        <CompanyShortcut key={slug} slug={slug} active={current.includes(`/company/${slug}`)} />
      ))}
    </div>
  );
}

function CompanyShortcut({ slug, active }: { slug: string; active: boolean }) {
  const { data: company } = useCompany(slug);
  return (
    <Link
      href={`/company/${slug}`}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        active && "bg-accent text-foreground",
      )}
    >
      <span className="h-7 w-7 rounded-lg" style={{ background: `${colorFromSlug(slug)}22` }} />
      <span className="flex-1 truncate">{company?.profile.name ?? slug}</span>
    </Link>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  hint,
}: NavLink & { active: boolean; collapsed: boolean }) {
  return (
    <Link
      href={href}
      title={hint ? `${label} — ${hint}` : label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
        collapsed && "justify-center px-0",
        active
          ? "bg-primary/10 text-primary shadow-[inset_2px_0_0_var(--primary)]"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0 transition-transform", !active && "group-hover:scale-110")} />
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
    </Link>
  );
}
