"use client";

import { useState } from "react";
import Image from "next/image";
import { cn, readableTextOn } from "@/lib/utils";
import { colorFromSlug } from "@/data/account";

/**
 * Domains verified to return a real upstream favicon from Google's service.
 * Other domains render a branded monogram instead — a generic grey globe
 * looks broken, so we never show one. Re-verify when adding a company.
 */
const VERIFIED_FAVICON_DOMAINS = new Set([
  "airtel.in",
  "hdfcbank.com",
  "icicibank.com",
  "tatamotors.com",
  "infosys.com",
  "itcnet.in",
  "asianpaints.com",
]);

/**
 * Upstream company favicon, loaded lazily from the issuer's public website
 * domain. If the source is unavailable we fall back to a coloured monogram,
 * so a missing logo never leaves an empty hole in the UI.
 */
export function CompanyLogo({
  slug,
  name,
  website,
  size = 32,
  className,
}: {
  slug: string;
  name: string;
  website?: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  let domain: string | null = null;
  if (website) {
    try {
      domain = new URL(website.startsWith("http") ? website : `https://${website}`)
        .hostname.replace(/^www\./, "");
    } catch {
      domain = null;
    }
  }

  // Only request an upstream icon from domains we have verified return a real
  // favicon. Everywhere else we render the branded monogram — Google's generic
  // grey globe reads as a broken image, so we never show it.
  const src = domain && VERIFIED_FAVICON_DOMAINS.has(domain)
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${Math.min(size * 2, 128)}`
    : null;

  const initials = name
    .split(/\s+/)
    .filter((part) => /^[A-Za-z0-9]/.test(part))
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const tint = colorFromSlug(slug);

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/40",
        className,
      )}
      style={{ width: size, height: size }}
      title={name}
    >
      {src && !failed ? (
        <Image
          src={src}
          alt=""
          width={size}
          height={size}
          unoptimized
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain p-1"
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center text-[10px] font-bold"
          style={{ background: tint, color: readableTextOn(tint) }}
          aria-hidden="true"
        >
          {initials}
        </span>
      )}
    </span>
  );
}
