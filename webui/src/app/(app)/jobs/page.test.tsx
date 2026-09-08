// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apis, ApiError } = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    code?: string;
    constructor(message: string, status: number, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return {
    apis: {
      jobs: vi.fn(),
      attributes: vi.fn(),
      uploadDocument: vi.fn(),
    },
    ApiError,
  };
});

vi.mock("@/lib/api", () => ({ api: apis, ApiError }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: {
      email: "lib@ziru.local",
      grade: "librarian",
      profile: [{ key: "division", values: ["ssd"] }],
      must_change_password: false,
      disabled: false,
      created_at: "2026-01-01T00:00:00",
    },
    loading: false,
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

import JobsPage from "./page";

const jobs = [
  { job_id: "job_1", document_id: "doc_1", status: "done", source_type: "file", data_id: null, created_at: "2026-01-01", progress: null, error: null, result: null, result_url: null, result_url_expires_at: null, file_name: "a.pdf", file_extension: "pdf", model: null, ocr_enabled: null, duration_seconds: 5, estimated_duration_s: null },
];
const attributes = [
  { key: "division", allowedValues: ["product", "ssd"], usage: 10 },
];

function makeFiles(count: number): File[] {
  return Array.from({ length: count }, (_, i) => new File(["x"], `f${i}.pdf`, { type: "application/pdf" }));
}

async function setFiles(container: HTMLElement, files: File[]) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, "files", { value: files, configurable: true });
  fireEvent.change(input);
}

beforeEach(() => {
  apis.jobs.mockResolvedValue({ jobs, total: 1 });
  apis.attributes.mockResolvedValue(attributes);
  apis.uploadDocument.mockResolvedValue({ job_id: "job_new" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("JobsPage upload", () => {
  it("opens the upload modal with attribute chips", async () => {
    const { container } = render(<JobsPage />);
    await screen.findByText("Jobs");

    fireEvent.click(screen.getByRole("button", { name: /Upload files/ }));

    expect(screen.getByText("Choose files")).toBeTruthy();
    expect(screen.getByText("Attributes (optional)")).toBeTruthy();
    expect(screen.getByText("division")).toBeTruthy();
    expect(screen.getByRole("button", { name: "ssd" })).toBeTruthy();
  });

  it("uploads selected files with the chosen attributes", async () => {
    const { container } = render(<JobsPage />);
    await screen.findByText("Jobs");
    fireEvent.click(screen.getByRole("button", { name: /Upload files/ }));

    await setFiles(container, makeFiles(2));
    fireEvent.click(screen.getByRole("button", { name: "ssd" }));
    fireEvent.click(screen.getByRole("button", { name: /Upload 2 files/ }));

    await waitFor(() => expect(apis.uploadDocument).toHaveBeenCalledTimes(2));
    const first = apis.uploadDocument.mock.calls[0][0] as FormData;
    expect(first.get("attributes")).toBe(JSON.stringify({ division: ["ssd"] }));
    expect(first.get("file")).toBeTruthy();

    expect(await screen.findByText(/2 uploaded/)).toBeTruthy();
  });

  it("caps the batch at the maximum and notes it", async () => {
    const { container } = render(<JobsPage />);
    await screen.findByText("Jobs");
    fireEvent.click(screen.getByRole("button", { name: /Upload files/ }));

    await setFiles(container, makeFiles(11));
    expect(await screen.findByText(/Only 10 files can be submitted at once/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Upload 10 files/ }));

    await waitFor(() => expect(apis.uploadDocument).toHaveBeenCalledTimes(10));
  });

  it("stops the batch on a 429 concurrency limit", async () => {
    apis.uploadDocument
      .mockResolvedValueOnce({ job_id: "job_new" })
      .mockRejectedValueOnce(new ApiError("Too many concurrent jobs", 429));
    const { container } = render(<JobsPage />);
    await screen.findByText("Jobs");
    fireEvent.click(screen.getByRole("button", { name: /Upload files/ }));

    await setFiles(container, makeFiles(2));
    fireEvent.click(screen.getByRole("button", { name: /Upload 2 files/ }));

    expect(await screen.findByText(/stopped \(concurrent job limit reached\)/)).toBeTruthy();
  });
});
