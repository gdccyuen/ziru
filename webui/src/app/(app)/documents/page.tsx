"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { ApiError, api, originalFileUrl, type AttributeEntry, type DocumentItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime } from "@/lib/format";

const PAGE_SIZE = 25;

export default function DocumentsPage() {
  const searchParams = useSearchParams();
  const highlightDocument = searchParams.get("document");
  const [attributes, setAttributes] = useState<AttributeEntry[]>([]);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const entries = await api.attributes();
        setAttributes(entries);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load attributes.");
      }
    })();
  }, []);

  useEffect(() => {
    // The list must show a spinner immediately when filters/page change; the
    // request itself resolves in the promise chain below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    let cancelled = false;
    const filters: string[] = [];
    for (const [key, values] of Object.entries(selected)) {
      for (const value of values) filters.push(key + "=" + value);
    }
    api
      .documents({ page, page_size: PAGE_SIZE, filters })
      .then((response) => {
        if (cancelled) return;
        setDocuments(response.documents);
        setTotalPages(response.pagination.total_pages);
        setTotal(response.pagination.total);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Failed to load documents.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, selected]);

  function toggleValue(key: string, value: string) {
    setSelected((current) => {
      const values = current[key] ?? [];
      const next = values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value];
      return { ...current, [key]: next };
    });
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-foreground">Documents</h1>
        {total > 0 ? (
          <p className="text-xs text-muted-foreground">{total} document{total === 1 ? "" : "s"}</p>
        ) : null}
      </div>
      {attributes.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/70 bg-background p-3">
          {attributes.map((attribute) => (
            <div key={attribute.key} className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-foreground">{attribute.key}</span>
              {(attribute.allowedValues ?? []).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleValue(attribute.key, value)}
                  className={"rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors" + ((selected[attribute.key] ?? []).includes(value) ? " border-primary bg-primary/10 text-primary" : " border-border text-muted-foreground hover:bg-muted")}
                >
                  {value}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
      {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
      {loading ? (
        <div className="flex justify-center py-10"><Spinner className="size-5" /></div>
      ) : documents.length === 0 ? (
        <p className="rounded-lg border border-border/70 bg-background p-6 text-center text-sm text-muted-foreground">
          No documents match the current filters in your visible scope.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/70 bg-background">
          <ul className="divide-y divide-border/60">
            {documents.map((document) => (
              <DocumentRow
                key={document.document_id}
                document={document}
                highlighted={document.document_id === highlightDocument}
              />
            ))}
          </ul>
        </div>
      )}
      {totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
            <ChevronLeft className="size-4" />
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
          <Button type="button" variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>
            Next
            <ChevronRight className="size-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function DocumentRow({
  document,
  highlighted,
}: {
  document: DocumentItem;
  highlighted: boolean;
}) {
  const attributes = document.attributes ?? {};
  const hasOriginal = Boolean(attributes["originalFile"]?.length);
  const attributeEntries = Object.entries(attributes);
  return (
    <li
      className={"px-4 py-3 transition-colors" + (highlighted ? " bg-primary/5 ring-1 ring-inset ring-primary/30" : " hover:bg-muted/30")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {document.source_file_name ?? document.document_id}
            </p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
              {document.document_id} · updated {formatDateTime(document.updated_at)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">{document.status}</Badge>
          {hasOriginal ? (
            <a
              href={originalFileUrl(document.document_id)}
              className="text-xs font-medium text-primary hover:underline"
            >
              View original
            </a>
          ) : null}
        </div>
      </div>
      {attributeEntries.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {attributeEntries.map(([key, values]) => (
            <Badge key={key} variant="outline" className="text-[10px] font-normal">
              {key}: {values.join(", ")}
            </Badge>
          ))}
        </div>
      ) : null}
    </li>
  );
}
