/**
 * Local account workspace.
 *
 * Accounts and their data are stored in this browser only. This is a real,
 * working personalisation layer (saved screens, alerts, notes, preferences)
 * but it is NOT server-side authentication — do not reuse a password here.
 */

export type WorkspaceUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

type StoredAccount = WorkspaceUser & { passwordHash: string; salt: string };

export type ScreenFilters = {
  sector: string;
  query: string;
  minMarketCap: number | null;
  maxPe: number | null;
  minRoe: number | null;
  minGrowth: number | null;
  direction: "any" | "gainers" | "losers";
};

export type SavedScreen = {
  id: string;
  name: string;
  filters: ScreenFilters;
  createdAt: string;
};

export type PriceAlert = {
  id: string;
  slug: string;
  ticker: string;
  name: string;
  direction: "above" | "below";
  target: number;
  createdAt: string;
  triggeredAt?: string;
};

export type ResearchNote = {
  id: string;
  slug?: string;
  title: string;
  body: string;
  updatedAt: string;
};

export type WorkspacePreferences = {
  density: "comfortable" | "compact";
  showFreshnessPanel: boolean;
  alertNotifications: boolean;
};

export type WorkspaceData = {
  screens: SavedScreen[];
  alerts: PriceAlert[];
  notes: ResearchNote[];
  preferences: WorkspacePreferences;
};

const ACCOUNTS_KEY = "investiq-accounts";
const ACTIVE_KEY = "investiq-active-user";
const GUEST_ID = "guest";
const workspaceKey = (id: string) => `investiq-workspace:${id}`;

export const DEFAULT_FILTERS: ScreenFilters = {
  sector: "all",
  query: "",
  minMarketCap: null,
  maxPe: null,
  minRoe: null,
  minGrowth: null,
  direction: "any",
};

const DEFAULT_PREFERENCES: WorkspacePreferences = {
  density: "comfortable",
  showFreshnessPanel: true,
  alertNotifications: true,
};

function emptyWorkspace(): WorkspaceData {
  return { screens: [], alerts: [], notes: [], preferences: { ...DEFAULT_PREFERENCES } };
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — keep the session working in memory */
  }
}

function readAccounts(): StoredAccount[] {
  const accounts = read<StoredAccount[]>(ACCOUNTS_KEY, []);
  return Array.isArray(accounts) ? accounts : [];
}

async function hash(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Deterministic non-cryptographic fallback (kept explicit: local-only data).
  let h = 2166136261;
  for (const byte of data) h = Math.imul(h ^ byte, 16777619);
  return (h >>> 0).toString(16);
}

function publicUser(account: StoredAccount): WorkspaceUser {
  const { id, name, email, createdAt } = account;
  return { id, name, email, createdAt };
}

export function getActiveUser(): WorkspaceUser | null {
  return read<WorkspaceUser | null>(ACTIVE_KEY, null);
}

export function isGuest(): boolean {
  return getActiveUser() === null;
}

export function displayName(): string {
  return getActiveUser()?.name ?? "Guest";
}

export async function signUp(name: string, email: string, password: string): Promise<WorkspaceUser> {
  const normalized = email.trim().toLowerCase();
  if (!name.trim()) throw new Error("Enter your name.");
  if (!/^\S+@\S+\.\S+$/.test(normalized)) throw new Error("Enter a valid email address.");
  if (password.length < 6) throw new Error("Use at least 6 characters.");

  const accounts = readAccounts();
  if (accounts.some((a) => a.email === normalized)) throw new Error("An account with that email already exists.");

  const salt = crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const account: StoredAccount = {
    id: `u-${salt.slice(0, 8)}`,
    name: name.trim(),
    email: normalized,
    createdAt: new Date().toISOString(),
    salt,
    passwordHash: await hash(password, salt),
  };
  write(ACCOUNTS_KEY, [...accounts, account]);
  write(ACTIVE_KEY, publicUser(account));
  return publicUser(account);
}

export async function signIn(email: string, password: string): Promise<WorkspaceUser> {
  const normalized = email.trim().toLowerCase();
  const account = readAccounts().find((a) => a.email === normalized);
  if (!account || (await hash(password, account.salt)) !== account.passwordHash) {
    throw new Error("Email or password is incorrect.");
  }
  write(ACTIVE_KEY, publicUser(account));
  return publicUser(account);
}

export function signOut(): void {
  write(ACTIVE_KEY, null);
}

export function getWorkspace(): WorkspaceData {
  const user = getActiveUser();
  const data = read<WorkspaceData>(workspaceKey(user?.id ?? GUEST_ID), emptyWorkspace());
  return {
    screens: Array.isArray(data.screens) ? data.screens : [],
    alerts: Array.isArray(data.alerts) ? data.alerts : [],
    notes: Array.isArray(data.notes) ? data.notes : [],
    preferences: { ...DEFAULT_PREFERENCES, ...(data.preferences ?? {}) },
  };
}

export function setWorkspace(next: WorkspaceData): void {
  const user = getActiveUser();
  write(workspaceKey(user?.id ?? GUEST_ID), next);
}

export function updateWorkspace(patch: Partial<WorkspaceData>): WorkspaceData {
  const next = { ...getWorkspace(), ...patch };
  setWorkspace(next);
  return next;
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
