import { cn } from "@/lib/utils";

/**
 * InvestIQ signature mark: a rising telemetry line forming a stylised "I"
 * inside a liquid-glass tile. Pure SVG so it stays crisp at any size and
 * inherits the app's light/dark palette without extra image requests.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      role="img"
      aria-label="InvestIQ"
      className={cn("h-8 w-8 shrink-0", className)}
    >
      <defs>
        <linearGradient id="iq-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1b2340" />
          <stop offset="55%" stopColor="#10162b" />
          <stop offset="100%" stopColor="#080b16" />
        </linearGradient>
        <linearGradient id="iq-line" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#16a34a" />
          <stop offset="55%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#6ee7b7" />
        </linearGradient>
        <linearGradient id="iq-edge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect x="1" y="1" width="38" height="38" rx="11" fill="url(#iq-tile)" />
      <rect x="1" y="1" width="38" height="38" rx="11" fill="none" stroke="#7dd3fc" strokeOpacity="0.35" />
      <path d="M6 11 Q20 2 34 11" fill="none" stroke="url(#iq-edge)" strokeWidth="1.2" />

      {/* rising telemetry line: the stem and apex read as a stylised "I" */}
      <path
        d="M9 28 L15 22 L20 25 L27 14 L32 10"
        fill="none"
        stroke="url(#iq-line)"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="27" cy="14" r="2.1" fill="#6ee7b7" />
      <circle cx="32" cy="10" r="3" fill="#34d399" fillOpacity="0.25" />
      <circle cx="32" cy="10" r="1.8" fill="#a7f3d0" />

      {/* baseline bars keep the "research terminal" read */}
      <path d="M9 31 H13 M16 31 H20 M23 31 H27 M30 31 H34" stroke="#34d399" strokeOpacity="0.4" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
