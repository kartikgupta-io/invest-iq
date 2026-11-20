"use client";

import { relativeTime } from "@/lib/utils";

/** ISO timestamp rendered as a relative age. Deterministic on first render. */
export function RelativeTime({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  return (
    <time dateTime={value ?? undefined} className={className} suppressHydrationWarning>
      {relativeTime(value)}
    </time>
  );
}
