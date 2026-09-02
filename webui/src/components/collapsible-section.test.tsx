// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { CollapsibleSection } from "./collapsible-section";

describe("CollapsibleSection", () => {
  afterEach(() => {
    cleanup();
  });

  it("is folded by default", () => {
    render(<CollapsibleSection title="Sources">hidden</CollapsibleSection>);

    expect(
      screen.getByRole("button", { name: /Sources/i }).getAttribute("aria-expanded"),
    ).toBe("false");
    expect(screen.queryByText("hidden")).toBeNull();
  });

  it("expands on click", async () => {
    const user = userEvent.setup();
    render(<CollapsibleSection title="Sources">chunk content</CollapsibleSection>);

    await user.click(screen.getByRole("button", { name: /Sources/i }));

    expect(screen.getByText("chunk content")).toBeTruthy();
  });
});
