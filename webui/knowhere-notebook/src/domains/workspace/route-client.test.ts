import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  ChatStreamError,
  workspaceRouteClient,
} from "./route-client"

describe("workspaceRouteClient", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it("sends JSON requests through same-origin route paths", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      const requestUrl = new URL(request.url)

      expect(request.method).toBe("POST")
      expect(requestUrl.pathname).toBe("/api/workspace")
      await expect(request.json()).resolves.toEqual({ name: "Notebook" })

      return Response.json({ ok: true })
    })
    vi.stubGlobal("fetch", fetch)

    await expect(
      workspaceRouteClient.postJson<{ ok: true }>("/api/workspace", {
        name: "Notebook",
      }),
    ).resolves.toEqual({ ok: true })
    expect(fetch).toHaveBeenCalledOnce()
  })

  it("returns response status with JSON bodies when callers need route status", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      const requestUrl = new URL(request.url)

      expect(request.method).toBe("POST")
      expect(requestUrl.pathname).toBe("/api/uploads")

      return Response.json({ id: "source_1" }, { status: 201 })
    })
    vi.stubGlobal("fetch", fetch)

    await expect(
      workspaceRouteClient.postJsonWithStatus<{ readonly id: string }>(
        "/api/uploads",
        {
          fileName: "notes.pdf",
        },
      ),
    ).resolves.toEqual({
      status: 201,
      body: { id: "source_1" },
    })
  })

  it("sends DELETE JSON requests through the shared browser route client", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      const requestUrl = new URL(request.url)

      expect(request.method).toBe("DELETE")
      expect(requestUrl.pathname).toBe("/api/uploads")
      await expect(request.json()).resolves.toEqual({
        pathname: "source-uploads/upload_1/document.pdf",
      })

      return Response.json({ ok: true })
    })
    vi.stubGlobal("fetch", fetch)

    await expect(
      workspaceRouteClient.deleteJson<{ readonly ok: true }>("/api/uploads", {
        pathname: "source-uploads/upload_1/document.pdf",
      }),
    ).resolves.toEqual({ ok: true })
  })

  it("parses NDJSON progress lines split across stream chunks", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      ndjsonResponse([
        `{"type":"phase","phase":"preparing"}\n{"type":"retriev`,
        `al_start","attempt":1,"query":"q","namespace":"default"}\n`,
        `{"type":"done","body":{"ok":true}}\n`,
      ]),
    )
    vi.stubGlobal("fetch", fetch)

    const progressLines: unknown[] = []
    const result = await workspaceRouteClient.postNdjsonWithProgress<{
      readonly ok: true
    }>("/api/chat", { message: "q" }, (line) => progressLines.push(line))

    expect(result).toEqual({ ok: true })
    expect(progressLines).toEqual([
      { type: "phase", phase: "preparing" },
      {
        type: "retrieval_start",
        attempt: 1,
        query: "q",
        namespace: "default",
      },
    ])
  })

  it("rejects with the status and message of an error NDJSON line", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      ndjsonResponse([
        `{"type":"error","status":401,"message":"Chat authentication failed."}\n`,
      ]),
    )
    vi.stubGlobal("fetch", fetch)

    await expect(
      workspaceRouteClient.postNdjsonWithProgress<unknown>(
        "/api/chat",
        { message: "q" },
        () => undefined,
      ),
    ).rejects.toMatchObject({
      name: "ChatStreamError",
      status: 401,
      message: "Chat authentication failed.",
    })
  })

  it("reads the JSON message on non-2xx responses", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ message: "No workspace yet." }, { status: 400 }),
    )
    vi.stubGlobal("fetch", fetch)

    await expect(
      workspaceRouteClient.postNdjsonWithProgress<unknown>(
        "/api/chat",
        { message: "q" },
        () => undefined,
      ),
    ).rejects.toEqual(new ChatStreamError(400, "No workspace yet."))
  })
})

function ndjsonResponse(chunks: readonly string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  })
}
