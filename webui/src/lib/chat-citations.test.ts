import { describe, expect, it } from "vitest";

import {
  annotateSourceMarkers,
  citationLabel,
  numberedCitations,
} from "./chat-citations";

describe("annotateSourceMarkers", () => {
  it("turns source markers into markdown anchor links", () => {
    expect(
      annotateSourceMarkers("See [Source 2: contract/intro] for details."),
    ).toBe("See [Source 2: contract/intro](#source-2) for details.");
  });

  it("handles multiple markers with spaces", () => {
    expect(annotateSourceMarkers("[Source 1: a.pdf] and [Source 3: b/c]")).toBe(
      "[Source 1: a.pdf](#source-1) and [Source 3: b/c](#source-3)",
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
