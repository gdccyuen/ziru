import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  answerChat: vi.fn(),
}));

vi.mock("@/domains/chat/route-answer", () => ({
  chatAnswerRouteService: {
    answerChat: mocks.answerChat,
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { POST } from "./route";

describe("POST /api/chat", () => {
  it("streams progress events then a done line as NDJSON", async () => {
    mocks.answerChat.mockImplementation(
      async ({ onProgress }: { onProgress?: (event: unknown) => void }) => {
        onProgress?.({ type: "phase", phase: "preparing" });
        onProgress?.({
          type: "retrieval_start",
          attempt: 1,
          query: "Gordon phone number",
          namespace: "default",
        });
        onProgress?.({ type: "retrieval_done", attempt: 1, resultCount: 5, referencedChunkCount: 1 });
        onProgress?.({ type: "phase", phase: "answering" });
        return {
          status: 200,
          body: {
            threadId: "thread_1",
            messages: [
              { id: "user_1", role: "user", content: "Summarize it" },
              { id: "assistant_1", role: "assistant", content: "Answer" },
            ],
          },
        };
      },
    );

    const response = await POST(
      new Request("http://localhost:3001/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: "Summarize it" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/x-ndjson; charset=utf-8",
    );
    const text = await response.text();
    const lines = text.split("\n").filter((line) => line.length > 0).map((line) => JSON.parse(line));
    expect(lines).toEqual([
      { type: "phase", phase: "preparing" },
      {
        type: "retrieval_start",
        attempt: 1,
        query: "Gordon phone number",
        namespace: "default",
      },
      { type: "retrieval_done", attempt: 1, resultCount: 5, referencedChunkCount: 1 },
      { type: "phase", phase: "answering" },
      {
        type: "done",
        body: {
          threadId: "thread_1",
          messages: [
            { id: "user_1", role: "user", content: "Summarize it" },
            { id: "assistant_1", role: "assistant", content: "Answer" },
          ],
        },
      },
    ]);
    expect(mocks.answerChat).toHaveBeenCalledWith({
      body: { message: "Summarize it" },
      onProgress: expect.any(Function),
    });
  });

  it("passes null to the chat route service when JSON parsing fails", async () => {
    mocks.answerChat.mockResolvedValue({
      status: 400,
      body: { message: "Enter a question before sending." },
    });

    const response = await POST(
      new Request("http://localhost:3001/api/chat", {
        method: "POST",
        body: "{",
      }),
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    const lines = text.split("\n").filter((line) => line.length > 0).map((line) => JSON.parse(line));
    expect(lines).toEqual([
      {
        type: "error",
        status: 400,
        message: "Enter a question before sending.",
      },
    ]);
    expect(mocks.answerChat).toHaveBeenCalledWith({
      body: null,
      onProgress: expect.any(Function),
    });
  });

  it("emits an error line when the route service throws", async () => {
    mocks.answerChat.mockRejectedValue(new Error("boom"));

    const response = await POST(
      new Request("http://localhost:3001/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: "Summarize it" }),
      }),
    );

    const text = await response.text();
    const lines = text.split("\n").filter((line) => line.length > 0).map((line) => JSON.parse(line));
    expect(lines).toEqual([
      { type: "error", status: 502, message: "The assistant could not answer right now." },
    ]);
  });
});
