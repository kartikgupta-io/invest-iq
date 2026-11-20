"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { FileText, Search } from "lucide-react";
import type { FinancialDocument } from "@/lib/types";
import { useDocuments } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/utils";

export default function CompanyDocumentsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { data: documents, isLoading, isError } = useDocuments(slug);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!documents) return [];
    const q = query.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((d) =>
      [d.title, d.type, d.form, d.source, d.fiscalPeriod].some((f) => (f ?? "").toLowerCase().includes(q)),
    );
  }, [documents, query]);

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle>Financial documents</CardTitle>
          <CardDescription>
            {documents ? `${documents.length} documents` : "Loading…"} from filings and investor relations.
          </CardDescription>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by title, type, source…" className="pl-9" />
        </div>
      </CardHeader>

      <CardContent>
        {isLoading || !documents ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : isError ? (
          <ErrorState title="Documents unavailable" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title={query ? "No matching documents" : "No documents yet"}
            description={query ? "Try a different search term." : "No filings are available for this company."}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Form</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Filed</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead className="text-right">Pages</TableHead>
                <TableHead>Version</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((doc) => (
                <DocumentRow key={doc.id} doc={doc} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function DocumentRow({ doc }: { doc: FinancialDocument }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <TableRow className="cursor-pointer">
          <TableCell><Badge variant={DOCUMENT_VARIANT(doc.type)}>{doc.type}</Badge></TableCell>
          <TableCell className="font-medium">{doc.title}</TableCell>
          <TableCell>{doc.form}</TableCell>
          <TableCell>{doc.fiscalPeriod}</TableCell>
          <TableCell className="whitespace-nowrap">{doc.filedDate}</TableCell>
          <TableCell>{doc.source}</TableCell>
          <TableCell className="text-right tabular-nums">{formatNumber(doc.sizeKb)} KB</TableCell>
          <TableCell className="text-right tabular-nums">{doc.pages}</TableCell>
          <TableCell><Badge variant="outline">{doc.latestVersion}</Badge></TableCell>
        </TableRow>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{doc.title}</DialogTitle>
          <DialogDescription>
            {doc.companySlug} · {doc.form} · {doc.fiscalPeriod}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Meta label="Type" value={doc.type} />
          <Meta label="Source" value={doc.source} />
          <Meta label="Filed date" value={doc.filedDate} />
          <Meta label="Period end" value={doc.periodEnd} />
          <Meta label="Pages" value={String(doc.pages)} />
          <Meta label="Size" value={`${formatNumber(doc.sizeKb)} KB`} />
          <Meta label="Fiscal period" value={doc.fiscalPeriod} />
          <Meta label="Content hash" value={doc.sha256?.slice(0, 16) + "…"} />
        </div>
        <div className="mt-2">
          <h4 className="mb-2 text-sm font-semibold">Version history</h4>
          {doc.versions?.length ? (
            <ul className="space-y-2">
              {doc.versions.map((v) => (
                <li key={v.version} className="rounded-xl border border-border/60 bg-muted/30 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">{v.version}</Badge>
                    <span className="text-xs text-muted-foreground">{v.uploadedAt}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">{v.note}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No version history.</p>
          )}
        </div>
        <div className="mt-2 flex justify-end">
          <Button asChild variant="outline" size="sm">
            <a href={doc.sourceUrl} target="_blank" rel="noreferrer">Open source</a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function DOCUMENT_VARIANT(type: string) {
  return DOCUMENT_VARIANT_MAP[type] ?? "outline";
}

const DOCUMENT_VARIANT_MAP: Record<string, "info" | "secondary" | "success" | "warning" | "outline"> = {
  "10-K": "success",
  "10-Q": "info",
  "8-K": "warning",
  "Annual Report": "secondary",
  "Quarterly Report": "info",
  "Investor Presentation": "outline",
  "Earnings Call Transcript": "outline",
};