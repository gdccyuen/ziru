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

export function parseExpiresAtInput(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const iso = new Date(raw);
  if (!Number.isNaN(iso.getTime())) return iso.toISOString();
  const dmY = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[, ]+(\d{1,2}):(\d{2}))?$/);
  if (dmY) {
    const [, day, month, year, hour, minute] = dmY;
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      hour ? Number(hour) : 0,
      minute ? Number(minute) : 0
    );
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const dMY = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:[, ]+(\d{1,2}):(\d{2}))?$/);
  if (dMY) {
    const [, day, month, year, hour, minute] = dMY;
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      hour ? Number(hour) : 0,
      minute ? Number(minute) : 0
    );
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  throw new Error("Use YYYY-MM-DD HH:MM, DD/MM/YYYY HH:MM, or an ISO date");
}

export function truncate(value: string, maxLength = 48): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

export function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

/** Format a Date as a native <input type="datetime-local"> value (local time). */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
  ].join("");
}

/** Default API-key expiry: now + 3 months, as a datetime-local value. */
export function defaultExpiryDatetimeLocal(): string {
  return toDatetimeLocalValue(addMonths(new Date(), 3));
}
