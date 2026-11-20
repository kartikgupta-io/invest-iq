"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import {
  Bell,
  Database,
  CreditCard,
  ShieldCheck,
  Info,
  Check,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const API_BASE = "http://localhost:8000/api/v1";

const BILLING_HISTORY = [
  { date: "Aug 1, 2026", amount: "₹999", status: "Paid", plan: "Pro" },
  { date: "Jul 1, 2026", amount: "₹999", status: "Paid", plan: "Pro" },
  { date: "Jun 1, 2026", amount: "₹799", status: "Paid", plan: "Pro" },
];

const PERMISSIONS = [
  { scope: "Fundamental data", value: "Unlimited" },
  { scope: "AI research queries", value: "500 / month" },
  { scope: "Document downloads", value: "Unlimited" },
  { scope: "Portfolio analysis", value: "100 positions" },
];

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();

  const [density, setDensity] = useState(true);
  const [compat, setCompat] = useState(false);
  const [animations, setAnimations] = useState(true);

  const [notif, setNotif] = useState({
    price: true,
    document: true,
    insight: false,
    weekly: true,
    security: true,
  });

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [twoFA, setTwoFA] = useState(true);
  const [saved, setSaved] = useState(false);

  const notify = (key: keyof typeof notif) => setNotif((n) => ({ ...n, [key]: !n[key] }));
  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure your appearance, notifications, and account.</p>
      </div>

      <Tabs defaultValue="appearance">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="appearance"><PaletteIcon /> Appearance</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="h-4 w-4" /> Notifications</TabsTrigger>
          <TabsTrigger value="data"><Database className="h-4 w-4" /> Data &amp; API</TabsTrigger>
          <TabsTrigger value="billing"><CreditCard className="h-4 w-4" /> Billing</TabsTrigger>
          <TabsTrigger value="security"><ShieldCheck className="h-4 w-4" /> Security</TabsTrigger>
          <TabsTrigger value="about"><Info className="h-4 w-4" /> About</TabsTrigger>
        </TabsList>

        <TabsContent value="appearance" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>Customize the look and feel of the workspace.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-1.5">
                <Label htmlFor="theme">Theme</Label>
                <Select value={theme ?? "system"} onValueChange={(v) => setTheme(v)}>
                  <SelectTrigger id="theme" className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <SettingRow title="Compact density" description="Reduce vertical spacing across cards" checked={density} onChange={setDensity} />
              <SettingRow title="Legacy compatibility" description="Enable fallbacks for older chart rendering" checked={compat} onChange={setCompat} />
              <SettingRow title="Animations" description="Show motion transitions between pages" checked={animations} onChange={setAnimations} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Notification preferences</CardTitle>
              <CardDescription>Choose which alerts you receive by email and in-app.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              <SettingRow title="Price alerts" description="Ticker threshold and 52-week moves" checked={notif.price} onChange={() => notify("price")} />
              <SettingRow title="Filings & documents" description="New SEC / exchange filing available" checked={notif.document} onChange={() => notify("document")} />
              <SettingRow title="AI insights" description="Generated research insights on your holdings" checked={notif.insight} onChange={() => notify("insight")} />
              <SettingRow title="Weekly digest" description="Portfolio performance summary each week" checked={notif.weekly} onChange={() => notify("weekly")} />
              <SettingRow title="Security alerts" description="Login and account activity notices" checked={notif.security} onChange={() => notify("security")} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Data &amp; API</CardTitle>
              <CardDescription>Connection details for the ingest pipeline.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="api">API base URL</Label>
                <Input id="api" value={API_BASE} readOnly className="font-mono text-xs" />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/40 p-3">
                <div>
                  <p className="text-sm font-medium">Data status</p>
                  <p className="text-xs text-muted-foreground">Queue-based ingestion · daily refreshes</p>
                </div>
                <Badge variant="success"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Operational</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="mt-4">
          <div className="space-y-4">
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
                <div>
                  <div className="flex items-center gap-2"><p className="text-lg font-semibold">Pro plan</p><Badge>Active</Badge></div>
                  <p className="text-sm text-muted-foreground">₹999 / month · unlimited documents</p>
                  <ul className="mt-3 grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
                    {PERMISSIONS.map((p) => (
                      <li key={p.scope} className="flex items-center gap-2 text-muted-foreground">
                        <Check className="h-4 w-4 text-emerald-500" /> {p.scope}: <span className="text-foreground">{p.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Button variant="outline">Manage plan</Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Billing history</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Date</TableHead><TableHead>Amount</TableHead><TableHead>Plan</TableHead><TableHead className="text-right">Status</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {BILLING_HISTORY.map((b) => (
                      <TableRow key={b.date}>
                        <TableCell>{b.date}</TableCell>
                        <TableCell className="tabular-nums">{b.amount}/mo</TableCell>
                        <TableCell>{b.plan}</TableCell>
                        <TableCell className="text-right"><Badge variant="success">Paid</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="security" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Security</CardTitle><CardDescription>Manage your password and sign-in options.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="curr">Current password</Label>
                  <Input id="curr" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="newp">New password</Label>
                  <Input id="newp" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                </div>
              </div>
              <Button onClick={flashSaved}>Update password</Button>
              <Separator />
              <SettingRow title="Two-factor authentication" description="Require a code from your authenticator app" checked={twoFA} onChange={setTwoFA} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="about" className="mt-4">
          <Card>
            <CardHeader><CardTitle>About InvestIQ AI</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p><span className="font-medium text-foreground">InvestIQ AI</span> — Next.js 16 App Router workspace for earnings, filings, and semantic research over official documents.</p>
              <Separator />
              <Row label="Version" value="1.0.0" />
              <Row label="Data sources" value="SEC EDGAR · NSE · BSE · Investor Relations" />
              <Row label="Runtime" value="Node.js · TypeScript · Tailwind" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {saved && (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
          <Check className="h-4 w-4" /> Settings saved
        </div>
      )}
    </div>
  );
}

function SettingRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function PaletteIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13.5" cy="6.5" r=".5" /><circle cx="17.5" cy="10.5" r=".5" /><circle cx="8.5" cy="7.5" r=".5" /><circle cx="6.5" cy="12.5" r=".5" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
    </svg>
  );
}