import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Pick black or white text for an arbitrary background colour so monograms and
 * colour chips stay above WCAG AA contrast, even for dynamically chosen hues.
 */
export function readableTextOn(hex: string): string {
  const value = hex.replace("#", "");
  if (value.length !== 3 && value.length !== 6) return "#ffffff";
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  const rgb = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const linear = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  return luminance > 0.179 ? "#0b1120" : "#ffffff";
}

export function formatCurrency(
  value: number,
  currency: string = "₹",
  notation: "standard" | "compact" = "standard",
  maxFractionDigits = 2,
) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    notation,
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
}

export function formatNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatPercent(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatLargeNumber(value: number) {
  if (Math.abs(value) >= 1e7) return `${(value / 1e7).toFixed(2)} Cr`;
  if (Math.abs(value) >= 1e5) return `${(value / 1e5).toFixed(2)} L`;
  return formatNumber(value);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Deterministic timestamp formatter in Indian Standard Time. A fixed
 * timeZone (not the viewer's local zone) keeps server-rendered HTML and
 * client hydration identical while matching the market this app covers.
 */
export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const formatted = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(date);
  return `${formatted} IST`;
}

/** Human relative age for an ISO timestamp (e.g. "12m ago", "3h ago"). */
export function relativeTime(value: string | null | undefined, now: number = Date.now()): string {
  if (!value) return "—";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "—";
  const seconds = Math.max(0, Math.floor((now - time) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** Render an unsourced numeric field honestly instead of inventing a zero. */
export function formatOrDash(
  value: number | null | undefined,
  formatter: (n: number) => string,
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatter(value);
}