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

  it("switches between text and tree views", async () => {
    const user = userEvent.setup();
    render(
      <ChatChunkPane
        open
        onClose={() => {}}
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

    expect(screen.getByText("alpha chunk body")).toBeTruthy();
    expect(screen.queryByRole("tree", { name: "Source section tree" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Tree" }));

    const tree = screen.getByRole("tree", { name: "Source section tree" });
    expect(tree).toBeTruthy();
    expect(screen.getByText("finance.pdf")).toBeTruthy();
    expect(screen.getByText("contract")).toBeTruthy();
    expect(screen.getByText("intro")).toBeTruthy();
    expect(
      screen.getByRole("treeitem", { name: /intro/ }).getAttribute("aria-current"),
    ).toBe("true");
    expect(screen.queryByText("alpha chunk body")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Text" }));

    expect(screen.getByText("alpha chunk body")).toBeTruthy();
    expect(screen.queryByRole("tree", { name: "Source section tree" })).toBeNull();
  });

  it("collapses and expands parent sections in tree view", async () => {
    const user = userEvent.setup();
    render(
      <ChatChunkPane
        open
        onClose={() => {}}
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

    await user.click(screen.getByRole("button", { name: "Tree" }));

    const root = screen.getByRole("treeitem", { name: /finance.pdf/ });
    expect(screen.getByText("intro")).toBeTruthy();

    await user.click(root);
    expect(screen.queryByText("contract")).toBeNull();
    expect(screen.queryByText("intro")).toBeNull();

    await user.click(root);
    expect(screen.getByText("intro")).toBeTruthy();
  });
});
