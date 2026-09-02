import type { RetrievalResult } from "@/lib/api";

export const SOURCE_MARKER = /\[Source\s+(\d+)\s*:\s*([^\]]+)\]/g;

export function annotateSourceMarkers(content: string): string {
  return content.replace(
    SOURCE_MARKER,
    (_match, ordinal: string, label: string) =>
      "[Source " + ordinal + ": " + label + "](#source-" + ordinal + ")",
  );
}

export function citationLabel(citation: RetrievalResult, index: number): string {
  return (
    citation.source?.section_path ??
    citation.source?.source_file_name ??
    citation.source?.document_id ??
    "Source " + (index + 1)
  );
}

export function numberedCitations(citations: readonly RetrievalResult[]) {
  const seen = new Set<string>();
  return citations.flatMap((citation, index) => {
    const key =
      String(citation.source?.document_id ?? "") +
      "|" +
      String(citation.chunk_id ?? "");
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ citation, index }];
  });
}
