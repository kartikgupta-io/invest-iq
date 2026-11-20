"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Search } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type DataTableColumn<T> = {
  key: string;
  label: string;
  align?: "left" | "right";
  /** Raw, unformatted value — used for sorting, filtering and CSV. */
  value: (row: T) => string | number | null | undefined;
  /** Optional custom cell. Defaults to the raw value. */
  render?: (row: T) => React.ReactNode;
};

type SortState = { key: string; dir: "asc" | "desc" } | null;

function csvCell(value: unknown): string {
  if (value == null) return "";
  const text = typeof value === "number" && !Number.isInteger(value)
    ? String(Number(value.toFixed(4)))
    : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Interactive table with column sorting, live filtering and CSV export.
 * Unsourced (null) values always sort last and export as empty cells.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  filename,
  initialSort = null,
  emptyMessage = "No rows to display.",
}: {
  rows: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string | number;
  filename: string;
  initialSort?: SortState;
  emptyMessage?: string;
}) {
  const [sort, setSort] = useState<SortState>(initialSort);
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matched = term
      ? rows.filter((row) => columns.some((column) => String(column.value(row) ?? "").toLowerCase().includes(term)))
      : rows;

    if (!sort) return matched;
    const column = columns.find((candidate) => candidate.key === sort.key);
    if (!column) return matched;

    const direction = sort.dir === "asc" ? 1 : -1;
    return [...matched].sort((a, b) => {
      const left = column.value(a);
      const right = column.value(b);
      if (left == null && right == null) return 0;
      if (left == null) return 1;
      if (right == null) return -1;
      if (typeof left === "number" && typeof right === "number") return (left - right) * direction;
      return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" }) * direction;
    });
  }, [rows, columns, query, sort]);

  function toggleSort(key: string) {
    setSort((current) => {
      if (!current || current.key !== key) return { key, dir: "asc" };
      if (current.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  function exportCsv() {
    const header = columns.map((column) => csvCell(column.label)).join(",");
    const body = visible.map((row) => columns.map((column) => csvCell(column.value(row))).join(",")).join("\r\n");
    // BOM keeps Indian rupee figures and en-dashes intact in Excel.
    const blob = new Blob(["\uFEFF", header, "\r\n", body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter rows…"
              aria-label="Filter table rows"
              className="h-8 w-44 pl-8 text-xs"
            />
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">
            {visible.length}{visible.length === rows.length ? "" : ` / ${rows.length}`} rows
          </span>
        </div>
        <div className="flex items-center gap-2">
          {sort ? (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Sorted by {columns.find((c) => c.key === sort.key)?.label} {sort.dir === "asc" ? "↑" : "↓"}
            </span>
          ) : null}
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={visible.length === 0} title="Download the current view as CSV">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => {
                const active = sort?.key === column.key;
                return (
                  <TableHead
                    key={column.key}
                    aria-sort={active ? (sort?.dir === "asc" ? "ascending" : "descending") : "none"}
                    className={cn(column.align === "right" && "text-right")}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      title={`Sort by ${column.label}`}
                      className={cn(
                        "jump inline-flex items-center gap-1 rounded-md px-1 py-1 -mx-1 hover:text-primary",
                        active && "text-primary",
                        column.align === "right" && "flex-row-reverse",
                      )}
                    >
                      {column.label}
                      {active ? (
                        sort?.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => (
              <TableRow key={rowKey(row)}>
                {columns.map((column) => (
                  <TableCell key={column.key} className={cn(column.align === "right" && "text-right")}>
                    {column.render ? column.render(row) : String(column.value(row) ?? "—")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
