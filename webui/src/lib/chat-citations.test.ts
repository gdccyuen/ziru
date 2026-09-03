import { describe, expect, it } from "vitest";

import {
  annotateSourceMarkers,
  citationLabel,
  numberedCitations,
  sourceMarkerTitle,
} from "./chat-citations";

describe("sourceMarkerTitle", () => {
  it("uses the source label when present", () => {
    expect(
      sourceMarkerTitle("4", "8. Domain Name System (DNS) Servers"),
    ).toBe("Source 4: 8. Domain Name System (DNS) Servers");
  });

  it("falls back to just the source number when the label is empty", () => {
    expect(sourceMarkerTitle("4", "")).toBe("Source 4");
    expect(sourceMarkerTitle("4")).toBe("Source 4");
  });
});

describe("annotateSourceMarkers", () => {
  it("turns source markers into compact markdown anchor links with tooltips", () => {
    expect(
      annotateSourceMarkers("See [Source 2: contract/intro] for details."),
    ).toBe('See [2](#source-2 "Source 2: contract/intro") for details.');
  });

  it("handles multiple markers with spaces", () => {
    expect(annotateSourceMarkers("[Source 1: a.pdf] and [Source 3: b/c]")).toBe(
      '[1](#source-1 "Source 1: a.pdf") and [3](#source-3 "Source 3: b/c")',
    );
  });

  it("keeps labels with parentheses and dots intact", () => {
    expect(
      annotateSourceMarkers(
        "[Source 4: 8. Domain Name System (DNS) Servers / 8.1 Domain Name System Security Extensions (DNSSEC)]",
      ),
    ).toBe(
      '[4](#source-4 "Source 4: 8. Domain Name System (DNS) Servers / 8.1 Domain Name System Security Extensions (DNSSEC)")',
    );
  });

  it("renders a bare marker number with a source-only tooltip", () => {
    expect(annotateSourceMarkers("[Source 4]")).toBe(
      '[4](#source-4 "Source 4")',
    );
  });
});

describe("citationLabel", () => {
  it("prefers section path over file name", () => {
    expect(
      citationLabel(
        {
          source: {
            section_path: "contract/intro",
            source_file_name: "finance.pdf",
            document_id: "doc_1",
          },
        },
        2,
      ),
    ).toBe("contract/intro");
  });

  it("falls back to source number", () => {
    expect(citationLabel({ source: null }, 4)).toBe("Source 5");
  });
});

describe("numberedCitations", () => {
  it("dedupes chunks but keeps their first ordinal", () => {
    const rows = numberedCitations([
      { chunk_id: "c1", source: { document_id: "d1" } },
      { chunk_id: "c2", source: { document_id: "d1" } },
      { chunk_id: "c1", source: { document_id: "d1" } },
    ]);

    expect(rows.map((row) => row.index)).toEqual([0, 1]);
    expect(rows.map((row) => row.citation.chunk_id)).toEqual(["c1", "c2"]);
  });
});
