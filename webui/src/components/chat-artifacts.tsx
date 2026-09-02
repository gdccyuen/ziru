"use client";

import { Image as ImageIcon, Table2 } from "lucide-react";
import type { RetrievalResult } from "@/lib/api";
import { citationLabel } from "@/lib/chat-citations";
import { CollapsibleSection } from "@/components/collapsible-section";

function isArtifact(citation: RetrievalResult): boolean {
  return citation.chunk_type === "image" || citation.chunk_type === "table";
}

export function ChatArtifacts({
  citations,
  onOpenCitation,
}: {
  citations: readonly RetrievalResult[];
  onOpenCitation: (index: number) => void;
}) {
  const artifacts = citations.flatMap((citation, index) =>
    isArtifact(citation) ? [{ citation, index }] : [],
  );
  if (artifacts.length === 0) return null;

  return (
    <CollapsibleSection
      title="Artifacts"
      badge={
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
          {artifacts.length}
        </span>
      }
      icon={<ImageIcon className="size-3" />}
    >
      <div className="space-y-2">
        {artifacts.map(({ citation, index }) => {
          const isImage =
            citation.chunk_type === "image" && Boolean(citation.asset_url);
          return (
            <div
              key={citation.chunk_id ?? index}
              className="rounded-md border border-border/50 bg-muted/30 px-2.5 py-2"
            >
              <button
                type="button"
                onClick={() => onOpenCitation(index)}
                className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                {citation.chunk_type === "table" ? (
                  <Table2 className="size-3.5 shrink-0" />
                ) : (
                  <ImageIcon className="size-3.5 shrink-0" />
                )}
                <span className="truncate">{citationLabel(citation, index)}</span>
              </button>
              {isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={citation.asset_url ?? ""}
                  alt={citationLabel(citation, index)}
                  className="max-h-64 w-auto rounded-md border border-border/60"
                />
              ) : null}
              {citation.content ? (
                <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-5 text-muted-foreground">
                  {citation.content}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}
