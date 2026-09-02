"use client";

import { FileText, X } from "lucide-react";
import type { RetrievalResult } from "@/lib/api";
import { citationLabel } from "@/lib/chat-citations";

function sectionBreadcrumb(sectionPath: string | null | undefined): string[] {
  if (!sectionPath) return [];
  return sectionPath
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function ChatChunkPane({
  open,
  citation,
  onClose,
}: {
  open: boolean;
  citation: RetrievalResult | null;
  onClose: () => void;
}) {
  if (!open) return null;

  const title = citation ? citationLabel(citation, 0) : "Source";
  const documentId = citation?.source?.document_id ?? null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Source chunk"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-3 backdrop-blur-sm sm:p-6"
    >
      <div className="flex h-full max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-foreground">{title}</h3>
            {documentId ? (
              <a
                href={"/documents?document=" + encodeURIComponent(documentId)}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                {documentId}
              </a>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close source chunk"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>

        {citation ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {sectionBreadcrumb(citation.source?.section_path).length > 0 ? (
              <div className="mb-3 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                {sectionBreadcrumb(citation.source?.section_path).map(
                  (part, index) => (
                    <span key={index} className="flex items-center gap-1">
                      {index > 0 ? <span>/</span> : null}
                      <span>{part}</span>
                    </span>
                  ),
                )}
              </div>
            ) : null}

            <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
              {citation.chunk_type ? (
                <span className="rounded-full bg-muted px-2 py-0.5">
                  {citation.chunk_type}
                </span>
              ) : null}
              {typeof citation.score === "number" ? (
                <span className="font-mono">score {citation.score.toFixed(4)}</span>
              ) : null}
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                {citation.content || "No chunk content was persisted."}
              </p>
            </div>

            <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <FileText className="size-3" />
              <span>
                {citation.source?.source_file_name ?? "Unknown source"}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            No source selected.
          </div>
        )}
      </div>
    </div>
  );
}
