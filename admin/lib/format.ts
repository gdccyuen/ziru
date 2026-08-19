import type { ProfileEntry } from "@/lib/api";

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const normalized = /Z$|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function gradeLabel(grade: string): string {
  switch (grade) {
    case "administrator":
      return "Administrator";
    case "librarian":
      return "Librarian";
    case "user":
      return "User";
    default:
      return grade;
  }
}

export type ProfileRow = {
  id: string;
  key: string;
  values: string;
};

let rowSequence = 0;

export function nextRowId(): string {
  rowSequence += 1;
  return `profile-row-${rowSequence}`;
}

export function profileToRows(profile: ProfileEntry[] | null | undefined): ProfileRow[] {
  return (profile ?? []).map((entry) => ({
    id: nextRowId(),
    key: entry.key,
    values: (entry.values ?? []).join(", "),
  }));
}

export function rowsToProfile(rows: ProfileRow[]): ProfileEntry[] {
  return rows
    .map((row) => ({
      key: row.key.trim(),
      values: row.values
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    }))
    .filter((entry) => entry.key.length > 0 && entry.values.length > 0);
}

export function splitAllowedValues(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function joinAllowedValues(values: string[] | null | undefined): string {
  return (values ?? []).join(", ");
}

export function truncate(value: string, maxLength = 48): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}
