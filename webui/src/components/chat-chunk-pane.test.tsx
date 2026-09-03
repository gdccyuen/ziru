// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatChunkPane } from "./chat-chunk-pane";

const alphaCitation = {
  chunk_id: "chunk_8_2_1",
  chunk_type: "text",
  content: "alpha chunk body",
  score: 0.82,
  source: {
    document_id: "doc_1",
    source_file_name: "finance.pdf",
    section_path: "8/8.2/8.2.1",
  },
};

const betaCitation = {
  chunk_id: "chunk_8_1",
  chunk_type: "text",
  content: "beta chunk body",
  score: 0.71,
  source: {
    document_id: "doc_1",
    source_file_name: "finance.pdf",
    section_path: "8/8.1",
  },
};

const gammaCitation = {
  chunk_id: "chunk_policy_overview",
  chunk_type: "text",
  content: "gamma chunk body",
  score: 0.64,
  source: {
    document_id: "doc_2",
    source_file_name: "policy.pdf",
    section_path: "policy/overview",
  },
};

const documentTree = {
  document_id: "doc_1",
  source_file_name: "finance.pdf",
  job_result_id: "jr_1",
  sections: [
    {
      id: "sec_8",
      section_path: "8",
      title: "8",
      level: 0,
      parent: null,
      leaf: false,
      chunk_count: 0,
      has_content: false,
      content_snippet: null,
      chunks: [],
      sort_order: 0,
    },
    {
      id: "sec_8_1",
      section_path: "8/8.1",
      title: "8.1",
      level: 1,
      parent: "sec_8",
      leaf: true,
      chunk_count: 1,
      has_content: true,
      content_snippet: "8.1 snippet body",
      chunks: [
        {
          chunk_id: "chunk_8_1",
          snippet: "8.1 snippet body",
          section_path: "8/8.1",
        },
      ],
      sort_order: 1,
    },
    {
      id: "sec_8_2",
      section_path: "8/8.2",
      title: "8.2",
      level: 1,
      parent: "sec_8",
      leaf: false,
      chunk_count: 0,
      has_content: false,
      content_snippet: null,
      chunks: [],
      sort_order: 2,
    },
    {
      id: "sec_8_3",
      section_path: "8/8.3",
      title: "8.3",
      level: 1,
      parent: "sec_8",
      leaf: true,
      chunk_count: 0,
      has_content: false,
      content_snippet: null,
      chunks: [],
      sort_order: 3,
    },
    {
      id: "sec_8_2_1",
      section_path: "8/8.2/8.2.1",
      title: "8.2.1",
      level: 2,
      parent: "sec_8_2",
      leaf: true,
      chunk_count: 1,
      has_content: true,
      content_snippet: "8.2.1 chunk body",
      chunks: [
        {
          chunk_id: "chunk_8_2_1",
          snippet: "8.2.1 chunk body",
          section_path: "8/8.2/8.2.1",
        },
      ],
      sort_order: 0,
    },
    {
      id: "sec_8_2_2",
      section_path: "8/8.2/8.2.2",
      title: "8.2.2",
      level: 2,
      parent: "sec_8_2",
      leaf: true,
      chunk_count: 0,
      has_content: false,
      content_snippet: null,
      chunks: [],
      sort_order: 1,
    },
  ],
};

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  };
}

function installDocumentTreeFetch(
  documentId = "doc_1",
  body: unknown = documentTree,
  chunkDetails: Record<string, unknown> = {},
) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (url === "/api/v2/documents/" + documentId + "/sections") {
      return Promise.resolve(jsonResponse(body));
    }
    const chunkMatch = url.match(
      /^\/api\/v2\/documents\/([^/]+)\/chunks\/([^/]+)$/,
    );
    if (chunkMatch) {
      const chunkId = decodeURIComponent(chunkMatch[2]);
      if (chunkDetails[chunkId]) {
        return Promise.resolve(jsonResponse(chunkDetails[chunkId]));
      }
      return Promise.resolve(
        jsonResponse({
          document_id: chunkMatch[1],
          chunk_id: chunkId,
          section_path: null,
          content: null,
          chunk_type: "text",
          metadata: {},
        }),
      );
    }
    return Promise.reject(new Error("Unexpected fetch: " + url));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("ChatChunkPane", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
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
    expect(screen.getByText("8/8.2/8.2.1")).toBeTruthy();
    expect(screen.getByText("alpha chunk body")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Close source chunk" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("switches between text and tree views rooted at the selected document", async () => {
    const user = userEvent.setup();
    installDocumentTreeFetch();
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

    const tree = await screen.findByRole("tree", {
      name: "Source section tree",
    });
    expect(within(tree).getByRole("treeitem", { name: /finance.pdf/ })).toBeTruthy();
    expect(within(tree).getByRole("treeitem", { name: "8" })).toBeTruthy();
    expect(screen.queryByText("alpha chunk body")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Text" }));

    expect(screen.getByText("alpha chunk body")).toBeTruthy();
    expect(screen.queryByRole("tree", { name: "Source section tree" })).toBeNull();
  });

  it("expands the document hierarchy 8 -> 8.1/8.2/8.3 and nested 8.2 -> 8.2.1/8.2.2", async () => {
    const user = userEvent.setup();
    installDocumentTreeFetch();
    render(
      <ChatChunkPane
        open
        citations={[alphaCitation]}
        selectedIndex={0}
        onClose={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Tree" }));
    const tree = await screen.findByRole("tree", {
      name: "Source section tree",
    });

    expect(within(tree).getByRole("treeitem", { name: "8" })).toBeTruthy();
    expect(within(tree).queryByRole("treeitem", { name: /8.1/ })).toBeNull();
    expect(within(tree).queryByRole("treeitem", { name: "8.2" })).toBeNull();
    expect(within(tree).queryByRole("treeitem", { name: "8.3" })).toBeNull();

    await user.click(within(tree).getByRole("treeitem", { name: "8" }));

    const section81 = within(tree).getByRole("treeitem", { name: /8.1/ });
    expect(section81).toBeTruthy();
    expect(within(section81).getByText("1")).toBeTruthy();
    expect(within(tree).getByRole("treeitem", { name: "8.2" })).toBeTruthy();
    expect(within(tree).getByRole("treeitem", { name: "8.3" })).toBeTruthy();

    await user.click(within(tree).getByRole("treeitem", { name: "8.2" }));

    expect(within(tree).getByRole("treeitem", { name: /8.2.1/ })).toBeTruthy();
    expect(within(tree).getByRole("treeitem", { name: "8.2.2" })).toBeTruthy();
  });

  it("opens a cited chunk leaf in text mode", async () => {
    const user = userEvent.setup();
    installDocumentTreeFetch();
    render(
      <ChatChunkPane
        open
        citations={[alphaCitation]}
        selectedIndex={0}
        onClose={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Tree" }));
    const tree = await screen.findByRole("tree", {
      name: "Source section tree",
    });

    await user.click(within(tree).getByRole("treeitem", { name: "8" }));
    await user.click(within(tree).getByRole("treeitem", { name: "8.2" }));
    await user.click(within(tree).getByRole("treeitem", { name: /8.2.1/ }));
    await user.click(
      within(tree).getByRole("treeitem", { name: /8.2.1 chunk body/ }),
    );

    expect(screen.queryByRole("tree", { name: "Source section tree" })).toBeNull();
    expect(screen.getByText("8/8.2/8.2.1")).toBeTruthy();
    expect(screen.getByText("alpha chunk body")).toBeTruthy();
  });

  it("opens a non-cited section chunk leaf from its full fetched content", async () => {
    const user = userEvent.setup();
    installDocumentTreeFetch("doc_1", documentTree, {
      chunk_8_1: {
        document_id: "doc_1",
        chunk_id: "chunk_8_1",
        section_path: "8/8.1",
        content: "8.1 FULL chunk body",
        chunk_type: "text",
        metadata: { page: 3 },
      },
    });
    render(
      <ChatChunkPane
        open
        citations={[alphaCitation]}
        selectedIndex={0}
        onClose={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Tree" }));
    const tree = await screen.findByRole("tree", {
      name: "Source section tree",
    });

    await user.click(within(tree).getByRole("treeitem", { name: "8" }));
    await user.click(within(tree).getByRole("treeitem", { name: /8.1/ }));
    await user.click(
      within(tree).getByRole("treeitem", { name: /8.1 snippet body/ }),
    );

    expect(screen.queryByRole("tree", { name: "Source section tree" })).toBeNull();
    expect(screen.getByText("8.1")).toBeTruthy();
    expect(screen.getByText("8.1 FULL chunk body")).toBeTruthy();
  });

  it("roots tree mode at the selected document instead of aggregating all citations", async () => {
    const user = userEvent.setup();
    installDocumentTreeFetch();
    render(
      <ChatChunkPane
        open
        citations={[alphaCitation, betaCitation, gammaCitation]}
        selectedIndex={0}
        onClose={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Tree" }));
    const tree = await screen.findByRole("tree", {
      name: "Source section tree",
    });

    expect(within(tree).getByRole("treeitem", { name: /finance.pdf/ })).toBeTruthy();
    expect(within(tree).queryByRole("treeitem", { name: /policy.pdf/ })).toBeNull();
    expect(within(tree).getByRole("treeitem", { name: "8" })).toBeTruthy();
  });
});
