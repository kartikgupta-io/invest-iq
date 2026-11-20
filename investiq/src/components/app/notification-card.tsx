"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  BellRing,
  FileText,
  Info,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/ui/relative-time";
import { StatusLed } from "@/components/ui/status-led";
import { cn } from "@/lib/utils";
import type { NotificationItem } from "@/lib/types";

const TYPE_META: Record<NotificationItem["type"], { icon: LucideIcon; className: string; label: string }> = {
  price: { icon: TrendingUp, className: "text-emerald-500", label: "Price" },
  document: { icon: FileText, className: "text-sky-500", label: "Filing" },
  insight: { icon: Sparkles, className: "text-violet-500", label: "Insight" },
  alert: { icon: ShieldAlert, className: "text-amber-500", label: "Alert" },
  system: { icon: Info, className: "text-muted-foreground", label: "System" },
};

export function NotificationCard({
  item,
  read,
  onRead,
}: {
  item: NotificationItem;
  read: boolean;
  onRead: (id: string) => void;
}) {
  const meta = TYPE_META[item.type] ?? TYPE_META.system;
  const Icon = meta.icon;
  const positive = / up |\+/i.test(item.title);

  return (
    <Card
      className={cn(
        "group cursor-pointer border-border/50 transition-all duration-200 hover:border-primary/40",
        read ? "opacity-70" : "border-l-2 border-l-primary/70",
      )}
      onClick={() => onRead(item.id)}
    >
      <CardContent className="flex items-start gap-3 p-4">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10", meta.className)}>
          {item.type === "price" && !positive ? <TrendingDown className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-sm font-semibold leading-tight">{item.title}</p>
            {item.source ? <Badge variant="outline" className="text-[10px]">{item.source}</Badge> : null}
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">{item.message}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-[11px] text-muted-foreground">
            <RelativeTime value={item.time} className="tabular-nums" />
            {item.slug ? (
              <Link
                href={`/company/${item.slug}`}
                onClick={(event) => event.stopPropagation()}
                className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
              >
                View company <ArrowUpRight className="h-3 w-3" />
              </Link>
            ) : null}
          </div>
        </div>
        {!read ? <span className="mt-1.5"><StatusLed tone="live" label="Unread" /></span> : null}
      </CardContent>
    </Card>
  );
}

export function EmptyNotifications({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 p-12 text-center text-muted-foreground">
        <BellRing className="h-8 w-8" />
        <p className="text-sm">{message}</p>
      </CardContent>
    </Card>
  );
}
