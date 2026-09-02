// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatArtifacts } from "./chat-artifacts";

describe("ChatArtifacts", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders image and table artifacts", async () => {
    const user = userEvent.setup();
    render(
      <ChatArtifacts
        onOpenCitation={() => {}}
        citations={[
          {
            chunk_id: "img_1",
            chunk_type: "image",
            asset_url: "/assets/img_1.png",
            content: "image chunk",
            source: { source_file_name: "slides.pdf", section_path: "deck/4" },
          },
          {
            chunk_id: "tbl_1",
            chunk_type: "table",
            content: "<table>alpha</table>",
            source: { source_file_name: "report.pdf", section_path: "results/t1" },
          },
          { chunk_id: "txt_1", chunk_type: "text", content: "plain text" },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Artifacts/i }));
    expect(screen.getByAltText("deck/4")).toBeTruthy();
    expect(screen.getByText(/<table>alpha<\/table>/)).toBeTruthy();
  });

  it("opens the artifact citation on click", async () => {
    const onOpenCitation = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatArtifacts
        onOpenCitation={onOpenCitation}
        citations={[
          { chunk_id: "txt_1", chunk_type: "text", content: "plain text" },
          {
            chunk_id: "img_1",
            chunk_type: "image",
            asset_url: "/assets/img_1.png",
            content: "image chunk",
            source: { source_file_name: "slides.pdf", section_path: "deck/4" },
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Artifacts/i }));
    await user.click(screen.getByText("deck/4"));

    expect(onOpenCitation).toHaveBeenCalledWith(1);
  });
});
