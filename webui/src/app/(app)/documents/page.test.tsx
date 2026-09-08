// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apis, ApiError } = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return {
    apis: {
      attributes: vi.fn(),
      documents: vi.fn(),
    },
    ApiError,
  };
});

vi.mock("@/lib/api", () => ({
  api: apis,
  originalFileUrl: (id: string) => `/api/v2/documents/${id}/file/original`,
  ApiError,
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: {
      email: "admin@ziru.local",
      grade: "administrator",
      profile: [],
      must_change_password: false,
      disabled: false,
      created_at: "2026-01-01T00:00:00",
    },
    loading: false,
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/corpus-scope", () => ({
  getCorpusScope: () => [],
  setCorpusScope: () => {},
  subscribeCorpusScope: () => () => {},
}));

import DocumentsPage from "./page";

const documents = [
  {
    document_id: "doc_abc",
    status: "active",
    current_job_result_id: "job_1",
    source_file_name: "a.pdf",
    created_at: "2026-01-02T03:04:05",
    updated_at: "2026-01-02T03:04:05",
    archived_at: null,
    creator_email: "creator@example.com",
    attributes: {
      division: ["ssd"],
      topic: ["security"],
      originalFile: ["objects/doc_abc/original/a.pdf"],
      createBy: ["user_1"],
    },
  },
  {
    document_id: "doc_def",
    status: "done",
    current_job_result_id: "job_2",
    source_file_name: "b.pdf",
    created_at: "2026-01-03T00:00:00",
    updated_at: "2026-01-03T00:00:00",
    archived_at: null,
    creator_email: "other@example.com",
    attributes: {},
  },
];

beforeEach(() => {
  apis.attributes.mockResolvedValue([
    { key: "division", allowedValues: ["ssd"], usage: 1 },
    { key: "topic", allowedValues: ["security"], usage: 1 },
  ]);
  apis.documents.mockResolvedValue({
    documents,
    pagination: { page: 1, page_size: 25, total: 2, total_pages: 1 },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DocumentsPage", () => {
  it("renders the Document heading and sort control", async () => {
    render(<DocumentsPage />);
    expect(await screen.findByText("Document")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Sort: Filename/ })).toBeTruthy();
    expect(screen.getByText("2 documents")).toBeTruthy();
  });

  it("shows creator email + created date and no docId", async () => {
    render(<DocumentsPage />);
    await screen.findByText("a.pdf");
    expect(screen.getByText(/creator@example\.com · created/)).toBeTruthy();
    expect(screen.queryByText(/doc_abc/)).toBeNull();
  });

  it("shows File and Tree actions", async () => {
    render(<DocumentsPage />);
    await screen.findByText("a.pdf");
    const row = screen.getByText("a.pdf").closest(".list-group-item") as HTMLElement;
    expect(within(row).getByText("Tree")).toBeTruthy();
    const fileLink = within(row).getByText("File");
    expect(fileLink.getAttribute("href")).toBe(
      "/api/v2/documents/doc_abc/file/original",
    );
  });

  it("sets the hover tooltip to only non-system attributes", async () => {
    render(<DocumentsPage />);
    await screen.findByText("a.pdf");
    const row = screen.getByText("a.pdf").closest(".list-group-item") as HTMLElement;
    const title = row.getAttribute("title") ?? "";
    expect(title).toContain("division: ssd");
    expect(title).toContain("topic: security");
    expect(title).not.toContain("createBy");
    expect(title).not.toContain("originalFile");
    const rowB = screen.getByText("b.pdf").closest(".list-group-item") as HTMLElement;
    expect(rowB.getAttribute("title")).toBeNull();
  });
});
