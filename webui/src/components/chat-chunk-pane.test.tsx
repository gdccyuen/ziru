// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatChunkPane } from "./chat-chunk-pane";

describe("ChatChunkPane", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when closed", () => {
    render(<ChatChunkPane open={false} citation={null} onClose={() => {}} />);

    expect(screen.queryByRole("dialog", { name: "Source chunk" })).toBeNull();
  });

  it("shows chunk content and closes", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatChunkPane
        open
        onClose={onClose}
        citation={{
          chunk_type: "text",
          content: "alpha chunk body",
          score: 0.82,
          source: {
            document_id: "doc_1",
            source_file_name: "finance.pdf",
            section_path: "contract/intro",
          },
        }}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Source chunk" })).toBeTruthy();
    expect(screen.getByText("contract/intro")).toBeTruthy();
    expect(screen.getByText("alpha chunk body")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Close source chunk" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
