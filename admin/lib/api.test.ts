import { describe, expect, it } from "vitest";
import {
  addMonths,
  formatDateTime,
  gradeLabel,
  joinAllowedValues,
  parseExpiresAtInput,
  profileToRows,
  rowsToProfile,
  splitAllowedValues,
  toDatetimeLocalValue,
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

describe("parseExpiresAtInput", () => {
  it("returns null for empty input", () => {
    expect(parseExpiresAtInput("")).toBeNull();
    expect(parseExpiresAtInput("   ")).toBeNull();
  });

  function parseOrThrow(value: string): Date {
    const iso = parseExpiresAtInput(value);
    if (iso === null) throw new Error("expected a parsed date");
    return new Date(iso);
  }

  it("parses ISO dates", () => {
    const iso = parseOrThrow("2026-08-22T22:38:00");
    expect(iso.getFullYear()).toBe(2026);
    expect(iso.getMonth()).toBe(7);
    expect(iso.getDate()).toBe(22);
    const spaced = parseOrThrow("2026-08-22 22:38");
    expect(spaced.getDate()).toBe(22);
    expect(spaced.getHours()).toBe(22);
  });

  it("parses the console's DD/MM/YYYY[,] HH:MM format", () => {
    const comma = parseOrThrow("22/8/2026, 22:38");
    expect(comma.getFullYear()).toBe(2026);
    expect(comma.getMonth()).toBe(7);
    expect(comma.getDate()).toBe(22);
    expect(comma.getHours()).toBe(22);
    const space = parseOrThrow("22/8/2026 22:38");
    expect(space.getDate()).toBe(22);
    const dateOnly = parseOrThrow("22/8/2026");
    expect(dateOnly.getDate()).toBe(22);
  });

  it("throws a clear error for unparseable input", () => {
    expect(() => parseExpiresAtInput("not-a-date")).toThrow(/ISO|DD\/MM\/YYYY/);
  });
});

describe("truncate", () => {
  it("truncates long strings", () => {
    expect(truncate("abcdefgh", 4)).toBe("abc…");
    expect(truncate("abc", 4)).toBe("abc");
  });
});

describe("datetime-local helpers", () => {
  it("formats a date as a native datetime-local value in local time", () => {
    const date = new Date(2026, 7, 22, 22, 38);
    expect(toDatetimeLocalValue(date)).toBe("2026-08-22T22:38");
  });

  it("pads month and day to two digits", () => {
    const date = new Date(2026, 0, 3, 9, 5);
    expect(toDatetimeLocalValue(date)).toBe("2026-01-03T09:05");
  });

  it("adds months for the default expiry", () => {
    const date = new Date(2026, 4, 15, 12, 0);
    const next = addMonths(date, 3);
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(7);
    expect(next.getDate()).toBe(15);
  });
});
