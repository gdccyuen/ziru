import type { ProfileEntry } from "@/lib/api";

export type AttributeMap = Record<string, string[]>;

/**
 * Fail-closed profile visibility check, mirroring the API's
 * shared.services.profile.profile_matches semantics:
 * an empty profile matches nothing, and every profile constraint must be
 * satisfied by at least one intersecting attribute value (AND across keys).
 */
export function profileMatchesAttributes(
  profile: ProfileEntry[] | null | undefined,
  attributes: AttributeMap
): boolean {
  const constraints = profile ?? [];
  if (constraints.length === 0) return false;
  return constraints.every((constraint) => {
    const values = attributes[constraint.key];
    if (!values || values.length === 0) return false;
    const allowed = new Set(constraint.values ?? []);
    return values.some((value) => allowed.has(value));
  });
}

/**
 * Return a human-readable reason the chosen attributes would be invisible to
 * the uploader's profile, or null when the profile can see the document.
 * Administrators are expected to bypass this check at the call site.
 */
export function profileVisibilityFailureReason(
  profile: ProfileEntry[] | null | undefined,
  attributes: AttributeMap
): string | null {
  const constraints = profile ?? [];
  if (constraints.length === 0) {
    return "your profile has no constraints, and an empty profile sees no documents";
  }
  const missing = constraints.filter((constraint) => {
    const values = attributes[constraint.key];
    if (!values || values.length === 0) return true;
    const allowed = new Set(constraint.values ?? []);
    return !values.some((value) => allowed.has(value));
  });
  if (missing.length === 0) return null;
  return missing
    .map((constraint) => `requires ${constraint.key}: ${(constraint.values ?? []).join(", ")}`)
    .join("; ");
}
