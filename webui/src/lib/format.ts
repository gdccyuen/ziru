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

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function profileSummary(
  profile: readonly { key: string; values: string[] }[],
): string {
  if (profile.length === 0) return "No profile constraints";
  return profile
    .map((entry) => `${entry.key}: ${entry.values.join(", ")}`)
    .join(" · ");
}
