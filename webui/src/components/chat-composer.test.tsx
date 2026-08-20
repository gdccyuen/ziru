// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatComposer } from "./chat-composer";

describe("ChatComposer", () => {
  afterEach(() => {
    cleanup();
  });
  it("sends on Enter", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<ChatComposer onSend={onSend} />);

    const textarea = screen.getByLabelText("Chat message");
    await user.type(textarea, "hello{Enter}");

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("hello");
  });

  it("keeps newlines on Shift+Enter", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<ChatComposer onSend={onSend} />);

    const textarea = screen.getByLabelText("Chat message");
    await user.type(textarea, "line one{Shift>}{Enter}{/Shift}line two");

    expect(onSend).not.toHaveBeenCalled();
    expect((textarea as HTMLTextAreaElement).value).toBe("line one\nline two");
  });

  it("does not send empty messages", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<ChatComposer onSend={onSend} />);

    const textarea = screen.getByLabelText("Chat message");
    await user.type(textarea, "   {Enter}");

    expect(onSend).not.toHaveBeenCalled();
  });
});
