import { describe, expect, it } from "vitest"

import {
  formatChatProgressText,
  isChatProgressEvent,
} from "./progress"

describe("formatChatProgressText", () => {
  it("keeps the base searching line for the preparing phase", () => {
    expect(formatChatProgressText({ type: "phase", phase: "preparing" })).toBe(
      "Searching sources…",
    )
  })

  it("appends the composing hint for the answering phase", () => {
    expect(formatChatProgressText({ type: "phase", phase: "answering" })).toBe(
      "Searching sources… composing answer…",
    )
  })

  it("shows the truncated retrieval query on the same line", () => {
    expect(
      formatChatProgressText({
        type: "retrieval_start",
        attempt: 1,
        query: "Gordon phone number",
        namespace: "default",
      }),
    ).toBe("Searching sources… query 1: Gordon phone number")
  })

  it("truncates long queries on the same line", () => {
    const longQuery = "please find the full contact details for everyone called Gordon".repeat(2)
    const text = formatChatProgressText({
      type: "retrieval_start",
      attempt: 2,
      query: longQuery,
      namespace: "default",
    })
    expect(text.startsWith("Searching sources… query 2: ")).toBe(true)
    expect(text.length).toBeLessThan(longQuery.length)
    expect(text.endsWith("…")).toBe(true)
  })

  it("shows the hit count for a completed retrieval", () => {
    expect(
      formatChatProgressText({
        type: "retrieval_done",
        attempt: 1,
        resultCount: 5,
        referencedChunkCount: 1,
      }),
    ).toBe("Searching sources… query 1 · 6 hits")
    expect(
      formatChatProgressText({
        type: "retrieval_done",
        attempt: 3,
        resultCount: 1,
        referencedChunkCount: 0,
      }),
    ).toBe("Searching sources… query 3 · 1 hit")
  })
})

describe("isChatProgressEvent", () => {
  it("accepts only progress event shapes", () => {
    expect(
      isChatProgressEvent({ type: "phase", phase: "preparing" }),
    ).toBe(true)
    expect(
      isChatProgressEvent({
        type: "retrieval_start",
        attempt: 1,
        query: "q",
        namespace: "default",
      }),
    ).toBe(true)
    expect(isChatProgressEvent({ type: "done", body: {} })).toBe(false)
    expect(isChatProgressEvent({ type: "error", status: 502 })).toBe(false)
    expect(isChatProgressEvent(null)).toBe(false)
    expect(isChatProgressEvent("phase")).toBe(false)
  })
})
