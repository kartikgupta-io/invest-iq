"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PortfolioHolding, Watchlist } from "../lib/types";

// Persisted state can outlive the shape of the store (older builds, hand-edited
// localStorage). Sanitize on rehydrate so a stale item can never crash render.
const safeArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

interface UiState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  commandOpen: boolean;
  aiDrawerOpen: boolean;
  /** Slug/name of the security the drawer was opened for, if any. */
  aiTarget: string | null;
  toggleSidebar: () => void;
  setSidebar: (v: boolean) => void;
  setMobileNav: (v: boolean) => void;
  setCommandOpen: (v: boolean) => void;
  setAiDrawer: (v: boolean, target?: string | null) => void;
  recentSearches: string[];
  pushRecent: (term: string) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      mobileNavOpen: false,
      commandOpen: false,
      aiDrawerOpen: false,
      aiTarget: null,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebar: (v) => set({ sidebarCollapsed: v }),
      setMobileNav: (v) => set({ mobileNavOpen: v }),
      setCommandOpen: (v) => set({ commandOpen: v }),
      setAiDrawer: (v, target = null) => set({ aiDrawerOpen: v, aiTarget: v ? target : null }),
      recentSearches: [],
      pushRecent: (term) =>
        set((s) => ({
          recentSearches: [term, ...s.recentSearches.filter((t) => t !== term)].slice(0, 5),
        })),
    }),
    {
      name: "investiq-ui",
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<UiState>;
        return { ...current, recentSearches: safeArray<string>(saved.recentSearches) };
      },
    },
  ),
);

interface WatchlistState {
  watchlists: Watchlist[];
  setWatchlists: (w: Watchlist[]) => void;
  addSymbol: (listId: string, symbol: string) => void;
  removeSymbol: (listId: string, symbol: string) => void;
  createWatchlist: (name: string, color: string) => void;
  removeWatchlist: (id: string) => void;
}

export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set) => ({
      watchlists: [],
      setWatchlists: (w) => set({ watchlists: w }),
      addSymbol: (listId, symbol) =>
        set((s) => ({
          watchlists: s.watchlists.map((w) =>
            w.id === listId && !w.symbols.includes(symbol)
              ? { ...w, symbols: [...w.symbols, symbol] }
              : w,
          ),
        })),
      removeSymbol: (listId, symbol) =>
        set((s) => ({
          watchlists: s.watchlists.map((w) =>
            w.id === listId ? { ...w, symbols: w.symbols.filter((x) => x !== symbol) } : w,
          ),
        })),
      createWatchlist: (name, color) =>
        set((s) => ({
          watchlists: [
            ...s.watchlists,
            {
              id: `wl-${Date.now()}`,
              name,
              color,
              symbols: [],
              updatedAt: "just now",
            },
          ],
        })),
      removeWatchlist: (id) => set((s) => ({ watchlists: s.watchlists.filter((w) => w.id !== id) })),
    }),
    {
      name: "investiq-watchlists",
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<WatchlistState>;
        return {
          ...current,
          watchlists: safeArray<Watchlist>(saved.watchlists).filter(
            (w) => w && typeof w.id === "string" && Array.isArray(w.symbols),
          ),
        };
      },
    },
  ),
);

interface NotificationsState {
  readIds: string[];
  markRead: (id: string) => void;
}

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set) => ({
      readIds: [],
      markRead: (id) => set((s) => ({ readIds: s.readIds.includes(id) ? s.readIds : [...s.readIds, id] })),
    }),
    {
      name: "investiq-notifications",
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<NotificationsState>;
        return { ...current, readIds: safeArray<string>(saved.readIds) };
      },
    },
  ),
);

interface PortfolioState {
  holdings: PortfolioHolding[];
  setHoldings: (h: PortfolioHolding[]) => void;
}

export const usePortfolioStore = create<PortfolioState>()(
  persist(
    (set) => ({ holdings: [], setHoldings: (h) => set({ holdings: h }) }),
    {
      name: "investiq-portfolio",
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PortfolioState>;
        return { ...current, holdings: safeArray<PortfolioHolding>(saved.holdings) };
      },
    },
  ),
);