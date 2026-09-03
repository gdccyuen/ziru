// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatChunkPane } from "./chat-chunk-pane";

const alphaCitation = {
  chunk_type: "text",
  content: "alpha chunk body",
  score: 0.82,
  source: {
    document_id: "doc_1",
    source_file_name: "finance.pdf",
    section_path: "contract/intro",
  },
};

const betaCitation = {
  chunk_type: "text",
  content: "beta chunk body",
  score: 0.71,
  source: {
    document_id: "doc_1",
    source_file_name: "finance.pdf",
    section_path: "contract/terms",
  },
};

const gammaCitation = {
  chunk_type: "text",
  content: "gamma chunk body",
  score: 0.64,
  source: {
    document_id: "doc_2",
    source_file_name: "policy.pdf",
    section_path: "policy/overview",
  },
};

describe("ChatChunkPane", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when closed", () => {
    render(
      <ChatChunkPane
        open={false}
        citations={[]}
        selectedIndex={null}
        onClose={() => {}}
      />,
    );

    expect(screen.queryByRole("dialog", { name: "Source chunk" })).toBeNull();
  });

  it("shows chunk content and closes", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatChunkPane
        open
        citations={[alphaCitation]}
        selectedIndex={0}
        onClose={onClose}
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
        citations={[alphaCitation]}
        selectedIndex={0}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("alpha chunk body")).toBeTruthy();
    expect(screen.queryByRole("tree", { name: "Source section tree" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Tree" }));

    const tree = screen.getByRole("tree", { name: "Source section tree" });
    expect(tree).toBeTruthy();
    expect(within(tree).getByRole("treeitem", { name: /finance.pdf/ })).toBeTruthy();
    expect(within(tree).getByRole("treeitem", { name: /contract/ })).toBeTruthy();
    expect(within(tree).getByRole("treeitem", { name: /intro/ })).toBeTruthy();
    expect(
      within(tree).getByRole("treeitem", { name: /intro/ }).getAttribute("aria-current"),
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
        citations={[alphaCitation]}
        selectedIndex={0}
        onClose={() => {}}
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

  it("shows sibling documents and sibling sections from the citation set", async () => {
    const user = userEvent.setup();
    render(
      <ChatChunkPane
        open
        citations={[alphaCitation, betaCitation, gammaCitation]}
        selectedIndex={0}
        onClose={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Tree" }));

    const tree = screen.getByRole("tree", { name: "Source section tree" });
    expect(within(tree).getByRole("treeitem", { name: /finance.pdf/ })).toBeTruthy();
    expect(within(tree).getByRole("treeitem", { name: /policy.pdf/ })).toBeTruthy();
    expect(within(tree).getByRole("treeitem", { name: /intro/ })).toBeTruthy();
    expect(within(tree).getByRole("treeitem", { name: /terms/ })).toBeTruthy();
    expect(
      within(tree).getByRole("treeitem", { name: /alpha chunk body/ }),
    ).toBeTruthy();
    expect(
      within(tree).getByRole("treeitem", { name: /beta chunk body/ }),
    ).toBeTruthy();
  });

  it("opens the clicked leaf's chunk in text mode", async () => {
    const user = userEvent.setup();
    render(
      <ChatChunkPane
        open
        citations={[alphaCitation, betaCitation]}
        selectedIndex={0}
        onClose={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Tree" }));

    await user.click(
      screen.getByRole("treeitem", { name: /beta chunk body/ }),
    );

    expect(screen.queryByRole("tree", { name: "Source section tree" })).toBeNull();
    expect(screen.getByText("contract/terms")).toBeTruthy();
    expect(screen.getByText("beta chunk body")).toBeTruthy();
    expect(screen.queryByText("alpha chunk body")).toBeNull();
  });
});
