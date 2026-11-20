"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, LogOut, Menu, Search, Sparkles } from "lucide-react";
import { useUiStore } from "@/store";
import { ThemeToggle } from "./theme-toggle";
import { CommandPalette } from "./command-palette";
import { FreshnessIndicator } from "./freshness-indicator";
import { Button } from "@/components/ui/button";
import { useMarketIndices, useNotifications, useUser } from "@/lib/api";
import { getActiveUser, signOut, type WorkspaceUser } from "@/lib/workspace";
import { useNotificationsStore } from "@/store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RelativeTime } from "@/components/ui/relative-time";
import { StatusLed } from "@/components/ui/status-led";

// The account lives in localStorage. useSyncExternalStore lets the menu read it
// on the client while still hydrating a matching guest shell on the server.
let cachedAccount: WorkspaceUser | null = null;

function subscribeToAccount() {
  // Navigation after sign-in/out remounts the menu, so no event stream is needed.
  return () => {};
}

function getAccountSnapshot(): WorkspaceUser | null {
  const current = getActiveUser();
  if (cachedAccount?.id !== current?.id) cachedAccount = current;
  return cachedAccount;
}

function getServerAccountSnapshot(): WorkspaceUser | null {
  return null;
}

export function Navbar() {
  const { setMobileNav, setCommandOpen, setAiDrawer } = useUiStore();
  const { data: indices = [] } = useMarketIndices();
  const { data: user } = useUser();

  return (
    <header className="glass-panel sticky top-0 z-40 border-b border-x-0 border-t-0">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobileNav(true)}>
          <Menu className="h-5 w-5" />
        </Button>

        <button
          onClick={() => setCommandOpen(true)}
          className="hidden h-10 w-full max-w-md items-center gap-2.5 rounded-xl border border-border/70 bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/70 md:flex"
          aria-label="Open search"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Search companies, tickers, filings…</span>
          <kbd className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
        </button>

        <div className="hidden flex-1 items-center justify-center gap-5 overflow-hidden xl:flex">
          {indices.slice(0, 4).map((ix) => (
            <span key={ix.ticker} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{ix.ticker}</span>
              <span className="tabular-nums">{ix.value.toLocaleString("en-IN")}</span>
              <span className={ix.changePct >= 0 ? "text-emerald-500" : "text-rose-500"}>
                {ix.changePct >= 0 ? "▲" : "▼"} {Math.abs(ix.changePct).toFixed(2)}%
              </span>
            </span>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <FreshnessIndicator />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open AI research drawer"
            title="AI Research — grounded answers from real evidence"
            onClick={() => setAiDrawer(true)}
            className="relative text-primary"
          >
            <Sparkles className="h-5 w-5" />
            <span className="absolute right-1 top-1"><StatusLed tone="live" label="AI ready" className="h-1.5 w-1.5" /></span>
          </Button>
          <ThemeToggle />
          <NotificationsMenu />
          <UserMenu initials={user?.initials ?? "U"} />
        </div>
      </div>
      <CommandPalette />
    </header>
  );
}

function NotificationsMenu() {
  const { data: items = [] } = useNotifications();
  const readIds = useNotificationsStore((s) => s.readIds);
  const unread = items.filter((n) => !n.read && !readIds.includes(n.id)).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-80">
          {items.map((n) => {
            const isRead = n.read || readIds.includes(n.id);
            return (
              <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-0.5 py-2">
                <span className="flex w-full items-center gap-2">
                  {!isRead && <StatusLed tone="live" label="Unread" className="h-1.5 w-1.5" />}
                  <span className="flex-1 text-sm font-medium">{n.title}</span>
                  <RelativeTime value={n.time} className="text-[10px] text-muted-foreground" />
                </span>
                <span className="pl-4 text-xs text-muted-foreground">{n.message}</span>
              </DropdownMenuItem>
            );
          })}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ initials }: { initials: string }) {
  const router = useRouter();
  const user = useSyncExternalStore(subscribeToAccount, getAccountSnapshot, getServerAccountSnapshot);

  const displayName = user?.name ?? "Guest workspace";
  const subtitle = user?.email ?? "Local, browser-only workspace";
  const avatarInitials = user
    ? user.name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()
    : initials;

  function handleSignOut() {
    signOut();
    router.push("/login");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded-full outline-none" aria-label="Account menu">
          <Avatar>
            <AvatarFallback className="bg-gradient-to-br from-primary to-sky-500 text-primary-foreground">{avatarInitials}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="px-2 py-1.5">
          <p className="text-sm font-semibold">{displayName}</p>
          <p className="truncate text-xs text-muted-foreground" title={subtitle}>{subtitle}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/profile">Profile</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/portfolio">Portfolio</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/settings">Settings</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/help">Help Center</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        {user ? (
          <DropdownMenuItem onSelect={handleSignOut}>
            <LogOut className="h-4 w-4" /> Sign out
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild><Link href="/login">Sign in</Link></DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}