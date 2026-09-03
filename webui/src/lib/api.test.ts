import { describe, expect, it } from "vitest";

import { ApiError, originalFileUrl } from "./api";
import { formatDateTime, gradeLabel, profileSummary } from "./format";

describe("ApiError", () => {
  it("carries status and error code", () => {
    const error = new ApiError("Password change required", 403, "PASSWORD_CHANGE_REQUIRED");
    expect(error.status).toBe(403);
    expect(error.code).toBe("PASSWORD_CHANGE_REQUIRED");
    expect(error.message).toBe("Password change required");
    expect(error).toBeInstanceOf(Error);
  });
});

describe("originalFileUrl", () => {
  it("builds the proxied original-file path", () => {
    expect(originalFileUrl("doc_abc")).toBe(
      "/api/v2/documents/doc_abc/file/original",
    );
  });

  it("encodes document ids", () => {
    expect(originalFileUrl("doc a/b")).toBe(
      "/api/v2/documents/doc%20a%2Fb/file/original",
    );
  });
});

describe("gradeLabel", () => {
  it("maps the three grades", () => {
    expect(gradeLabel("administrator")).toBe("Administrator");
    expect(gradeLabel("librarian")).toBe("Librarian");
    expect(gradeLabel("user")).toBe("User");
  });

  it("falls back to the raw grade", () => {
    expect(gradeLabel("mystery")).toBe("mystery");
  });
});

describe("profileSummary", () => {
  it("summarizes constraints", () => {
    expect(
      profileSummary([
        { key: "division", values: ["finance", "sales"] },
        { key: "region", values: ["apac"] },
      ]),
    ).toBe("division: finance, sales · region: apac");
  });

  it("handles an empty profile", () => {
    expect(profileSummary([])).toBe("No profile constraints");
  });
});

describe("formatDateTime", () => {
  it("formats date strings", () => {
    expect(formatDateTime("2026-01-02T03:04:05")).toContain("2026");
  });

  it("treats naive timestamps as UTC", () => {
    const expected = new Date("2026-01-02T03:04:05Z").toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    expect(formatDateTime("2026-01-02T03:04:05")).toBe(expected);
  });

  it("handles null", () => {
    expect(formatDateTime(null)).toBe("—");
  });
});
