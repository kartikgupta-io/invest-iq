"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useUiStore } from "@/store";
import { NAV_GROUPS, WORKSPACE_LINKS, type NavLink } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";
import { Sidebar } from "./sidebar";
import { Navbar } from "./navbar";
import { AiResearchDrawer } from "./ai-research-drawer";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { mobileNavOpen, setMobileNav } = useUiStore();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <MobileDrawer open={mobileNavOpen} onClose={() => setMobileNav(false)} />
      <AiResearchDrawer />
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar />
        <motion.main
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="flex-1 px-4 py-6 sm:px-6 lg:px-8"
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
}

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div className={cn("fixed inset-0 z-50 lg:hidden", open ? "pointer-events-auto" : "pointer-events-none")}>
      <div
        className={cn("absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity", open ? "opacity-100" : "opacity-0")}
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        initial={{ x: "-100%" }}
        animate={{ x: open ? 0 : "-100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 320 }}
        className="glass-panel absolute left-0 top-0 flex h-full w-[290px] flex-col border-y-0 border-l-0"
        role="dialog"
        aria-label="Navigation"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <Link href="/" onClick={onClose} className="flex items-center gap-2.5">
            <BrandMark className="h-8 w-8" />
            <span className="font-display text-base font-bold">
              InvestIQ <span className="text-gradient">AI</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-4 pb-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <MobileLink key={item.href} item={item} onClick={onClose} />
                ))}
              </div>
            </div>
          ))}
          <div>
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
              Workspace
            </p>
            <div className="space-y-0.5">
              {WORKSPACE_LINKS.map((item) => (
                <MobileLink key={item.href} item={item} onClick={onClose} />
              ))}
            </div>
          </div>
        </nav>
      </motion.div>
    </div>
  );
}

function MobileLink({ item, onClick }: { item: NavLink; onClick: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <item.icon className="h-4 w-4 shrink-0" />
      <span>{item.label}</span>
    </Link>
  );
}
