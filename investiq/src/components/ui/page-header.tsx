import { cn } from "@/lib/utils";

/** Consistent, dense page heading with an optional eyebrow and action area. */
export function PageHeader({
  eyebrow,
  title,
  description,
  icon,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0 space-y-1.5">
        {eyebrow ? (
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/80">{eyebrow}</p>
        ) : null}
        <h1 className="font-display flex items-center gap-2.5 text-2xl font-bold tracking-tight sm:text-3xl">
          {icon}
          {title}
        </h1>
        {description ? <p className="max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
