// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ChatMessageList } from "./chat-message-list";

describe("ChatMessageList", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders inline source markers as compact [N] anchors with tooltip text", () => {
    render(
      <ChatMessageList
        messages={[
          {
            id: "msg_1",
            thread_id: "thread_1",
            role: "assistant",
            content:
              "See [Source 4: 8. Domain Name System (DNS) Servers / 8.1 Domain Name System Security Extensions (DNSSEC)] for details.",
            citations: [],
            trace: null,
            created_at: "2026-09-03T09:00:00Z",
          },
        ]}
      />,
    );

    const marker = screen.getByRole("button", { name: "4" });
    expect(marker.getAttribute("title")).toBe(
      "Source 4: 8. Domain Name System (DNS) Servers / 8.1 Domain Name System Security Extensions (DNSSEC)",
    );
  });
});
