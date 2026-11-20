"use client";

import { useState } from "react";
import {
  Building2,
  Activity,
  Sparkles,
  Star,
  SlidersHorizontal,
  Save,
} from "lucide-react";
import { useUser } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

const STATS = [
  { label: "Watchlists", value: "3", icon: Star },
  { label: "Holdings", value: "4", icon: Building2 },
  { label: "AI queries", value: "128", icon: Sparkles },
  { label: "Documents read", value: "42", icon: Activity },
];

export default function ProfilePage() {
  const { data: user } = useUser();

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [bio, setBio] = useState("");
  const [saved, setSaved] = useState(false);

  const saveForm = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-6 sm:flex-row sm:items-start">
          <Avatar size="xl">
            <AvatarFallback className="text-xl">{user?.initials ?? "IQ"}</AvatarFallback>
          </Avatar>
          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <h1 className="text-xl font-bold">{user?.name}</h1>
              <Badge variant="info">{user?.plan}</Badge>
              <Badge variant="outline">{user?.role}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">Member since {user?.memberSince}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATS.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <s.icon className="h-4 w-4 text-primary" /> {s.label}
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="account">
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="activity"><Activity className="h-4 w-4" /> Activity</TabsTrigger>
          <TabsTrigger value="preferences"><SlidersHorizontal className="h-4 w-4" /> Preferences</TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Edit profile</CardTitle><CardDescription>Update your public profile information.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pf-name">Full name</Label>
                  <Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pf-email">Email</Label>
                  <Input id="pf-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-bio">Bio</Label>
                <textarea
                  id="pf-bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  placeholder="Tell us about your investing focus…"
                  className="w-full resize-none rounded-xl border border-input bg-background/50 px-3 py-2.5 text-sm shadow-sm backdrop-blur placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Profile is stored locally in this session.</p>
                <Button onClick={saveForm}><Save className="h-4 w-4" /> Save changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Recent activity</CardTitle><CardDescription>Your latest actions across the workspace.</CardDescription></CardHeader>
            <CardContent className="space-y-0">
              {[
                { icon: Star, text: "Added TATAMOTORS to High Growth watchlist", time: "2h ago" },
                { icon: Sparkles, text: "Ran an AI research query on cash flow", time: "5h ago" },
                { icon: Building2, text: "Viewed Reliance Industries FY2026 report", time: "1d ago" },
                { icon: Activity, text: "Exported portfolio allocation snapshot", time: "2d ago" },
              ].map((a, i) => (
                <div key={i} className="flex items-center gap-3 py-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><a.icon className="h-4 w-4" /></span>
                  <p className="flex-1 text-sm">{a.text}</p>
                  <span className="text-xs text-muted-foreground">{a.time}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Preferences</CardTitle><CardDescription>Your defaults across the app.</CardDescription></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <PreferenceRow label="Default market" value="NSE India" />
              <PreferenceRow label="Currency display" value="₹ (INR)" />
              <PreferenceRow label="Chart period" value="FY2018 – FY2026" />
              <PreferenceRow label="Search scope" value="Global filings" />
              <Separator />
              <p className="text-xs text-muted-foreground">Advanced preferences are managed under Settings.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {saved && (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
          <Save className="h-4 w-4" /> Profile saved
        </div>
      )}
    </div>
  );
}

function PreferenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-card/40 px-3 py-2.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}