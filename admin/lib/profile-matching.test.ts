import { describe, expect, it } from "vitest";
import { profileMatchesAttributes, profileVisibilityFailureReason } from "@/lib/profile-matching";

describe("profile visibility matching", () => {
  it("matches a single constraint by intersecting values", () => {
    const profile = [{ key: "division", values: ["finance", "sales"] }];
    expect(profileMatchesAttributes(profile, { division: ["sales"] })).toBe(true);
    expect(profileVisibilityFailureReason(profile, { division: ["sales"] })).toBeNull();
  });

  it("fails closed when a profile key is missing from the attributes", () => {
    const profile = [{ key: "division", values: ["product"] }];
    expect(profileMatchesAttributes(profile, { region: ["apac"] })).toBe(false);
    expect(profileVisibilityFailureReason(profile, { region: ["apac"] })).toBe(
      "requires division: product"
    );
  });

  it("requires every constraint key to match", () => {
    const profile = [
      { key: "division", values: ["finance"] },
      { key: "region", values: ["apac"] },
    ];
    expect(profileMatchesAttributes(profile, { division: ["finance"], region: ["emea"] })).toBe(
      false
    );
    expect(profileMatchesAttributes(profile, { division: ["finance"], region: ["apac"] })).toBe(
      true
    );
  });

  it("treats an empty profile as visible to nothing", () => {
    expect(profileMatchesAttributes([], { division: ["finance"] })).toBe(false);
    expect(profileVisibilityFailureReason([], {})).toContain("empty profile");
  });
});
