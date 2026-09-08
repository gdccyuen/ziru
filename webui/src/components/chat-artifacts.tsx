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
        <span className="badge text-bg-secondary">{artifacts.length}</span>
      }
      icon={<ImageIcon style={{ width: "1em", height: "1em" }} />}
    >
      <div className="d-flex flex-column gap-2">
        {artifacts.map(({ citation, index }) => {
          const isImage =
            citation.chunk_type === "image" && Boolean(citation.asset_url);
          return (
            <div
              key={citation.chunk_id ?? index}
              className="border rounded-2 px-2 py-2 bg-body-tertiary"
            >
              <button
                type="button"
                onClick={() => onOpenCitation(index)}
                className="d-flex align-items-center gap-1 small fw-medium mb-1 border-0 bg-transparent p-0 text-primary hover:underline"
              >
                {citation.chunk_type === "table" ? (
                  <Table2 style={{ width: "1em", height: "1em" }} className="flex-shrink-0" />
                ) : (
                  <ImageIcon style={{ width: "1em", height: "1em" }} className="flex-shrink-0" />
                )}
                <span className="text-truncate">{citationLabel(citation, index)}</span>
              </button>
              {isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={citation.asset_url ?? ""}
                  alt={citationLabel(citation, index)}
                  className="img-fluid rounded-2 border"
                  style={{ maxHeight: "16rem" }}
                />
              ) : null}
              {citation.content ? (
                <p className="mt-2 mb-0 small text-secondary whitespace-pre-wrap">
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
