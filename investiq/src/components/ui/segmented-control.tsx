"use client";

import { cn } from "@/lib/utils";

export type Segment<T extends string> = { value: T; label: string; count?: number };

/**
 * Compact, accessible filter control. Arrow-key navigation and aria-pressed
 * make it intuitive for both mouse and keyboard users.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  size = "sm",
}: {
  options: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="group"
      aria-label="Filter items"
      className={cn(
        "inline-flex flex-wrap items-center gap-1 rounded-xl border border-border/60 bg-muted/30 p-1 backdrop-blur",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg font-medium transition-all duration-200",
              size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm",
              active
                ? "bg-primary text-primary-foreground shadow-[0_0_18px_-6px_var(--shadow-glow)]"
                : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] tabular-nums",
                  active ? "bg-primary-foreground/20" : "bg-muted",
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
