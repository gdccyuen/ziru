import { describe, expect, it } from "vitest";
import {
  formatDateTime,
  gradeLabel,
  joinAllowedValues,
  profileToRows,
  rowsToProfile,
  splitAllowedValues,
  truncate,
} from "@/lib/format";

describe("formatDateTime", () => {
  it("normalizes timezone-less UTC datetimes", () => {
    expect(formatDateTime("2026-01-02T03:04:05")).toContain("2026");
  });

  it("handles null and empty values", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
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

describe("profile rows", () => {
  it("round-trips profiles through rows", () => {
    const profile = [
      { key: "division", values: ["finance", "sales"] },
      { key: "region", values: ["apac"] },
    ];
    expect(rowsToProfile(profileToRows(profile))).toEqual(profile);
  });

  it("drops empty rows", () => {
    expect(
      rowsToProfile([
        { id: "row-1", key: "  ", values: " " },
        { id: "row-2", key: "ok", values: "a, b" },
      ])
    ).toEqual([{ key: "ok", values: ["a", "b"] }]);
  });
});

describe("allowed values helpers", () => {
  it("splits and trims comma-separated values", () => {
    expect(splitAllowedValues(" a, b ,, c ")).toEqual(["a", "b", "c"]);
  });

  it("joins values for editing", () => {
    expect(joinAllowedValues(["a", "b"])).toBe("a, b");
    expect(joinAllowedValues(null)).toBe("");
  });
});

describe("truncate", () => {
  it("truncates long strings", () => {
    expect(truncate("abcdefgh", 4)).toBe("abc…");
    expect(truncate("abc", 4)).toBe("abc");
  });
});
