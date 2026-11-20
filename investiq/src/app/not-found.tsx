import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="relative flex min-h-[70vh] flex-1 flex-col items-center justify-center overflow-hidden px-6 text-center">
      <div className="bg-mesh pointer-events-none absolute inset-0" />
      <div className="relative flex flex-col items-center gap-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <TrendingUp className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <p className="text-gradient text-sm font-medium uppercase tracking-widest">Error 404</p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Page not found</h1>
          <p className="mx-auto max-w-md text-muted-foreground">
            The page you are looking for doesn&apos;t exist or has been moved. Let&apos;s get you back
            to solid ground.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/">Back to home</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}