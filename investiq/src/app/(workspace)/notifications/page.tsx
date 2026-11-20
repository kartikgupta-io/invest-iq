import type { Metadata } from "next";
import { getServerNotifications } from "@/lib/server-data";
import { NotificationsView } from "./notifications-view";

export const metadata: Metadata = {
  title: "Notifications",
  description: "A real, sourced feed of price moves, alerts, filings and data-sync events.",
};

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const initial = await getServerNotifications();
  return <NotificationsView initial={initial} />;
}
