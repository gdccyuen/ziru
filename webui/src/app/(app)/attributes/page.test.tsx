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
      attributes: vi.fn(),
      documents: vi.fn(),
      createAttribute: vi.fn(),
      updateAttribute: vi.fn(),
      deleteAttribute: vi.fn(),
    },
    ApiError,
  };
});

vi.mock("@/lib/api", () => ({ api: apis, ApiError }));
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
}));

import AttributesPage from "./page";

const dictionary = [
  { key: "division", allowedValues: ["product", "engineering", "exec", "ssd"], usage: 27 },
  { key: "topic", allowedValues: ["security", "practice"], usage: 3 },
];
const documents = [
  { document_id: "doc_1", attributes: { division: ["ssd"] } },
  { document_id: "doc_2", attributes: { division: ["ssd"], topic: ["security"] } },
];

beforeEach(() => {
  apis.attributes.mockResolvedValue(dictionary);
  apis.documents.mockResolvedValue({
    documents,
    pagination: { page: 1, page_size: 200, total: 2, total_pages: 1 },
  });
  apis.createAttribute.mockResolvedValue({ key: "branch", allowedValues: [] });
  apis.updateAttribute.mockResolvedValue({
    key: "division",
    allowedValues: ["engineering", "exec", "ssd"],
  });
  apis.deleteAttribute.mockResolvedValue({ deleted: "topic" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AttributesPage", () => {
  it("renders the dictionary with in-use counts", async () => {
    render(<AttributesPage />);
    expect(await screen.findByText("division")).toBeTruthy();
    expect(screen.getByText("in use by 27 document(s)")).toBeTruthy();
    expect(screen.getByText("topic")).toBeTruthy();
    expect(screen.getByText("in use by 3 document(s)")).toBeTruthy();
  });

  it("prevents removing an in-use value and saves the allowedValues", async () => {
    render(<AttributesPage />);
    await screen.findByText("division");

    fireEvent.click(screen.getByRole("button", { name: "Edit division" }));

    const ssdRemove = await screen.findByRole("button", {
      name: "Remove ssd from division",
    });
    expect((ssdRemove as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: "Remove product from division" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save division" }));

    await waitFor(() =>
      expect(apis.updateAttribute).toHaveBeenCalledWith(
        "division",
        ["engineering", "exec", "ssd"],
      ),
    );
  });

  it("disables delete when a key is in use", async () => {
    render(<AttributesPage />);
    await screen.findByText("division");
    expect(
      (screen.getByRole("button", { name: "Delete division" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Delete topic" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
