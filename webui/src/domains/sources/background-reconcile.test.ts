import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  trigger: vi.fn(),
  makeZiruClient: vi.fn(),
  pollSourceReconciliation: vi.fn(),
  markSourceReadyAfterReconciliation: vi.fn(),
}))

vi.mock("@upstash/workflow", () => ({
  Client: class {
    trigger = mocks.trigger
  },
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    error: mocks.loggerError,
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
  },
}))

vi.mock("@/integrations/ziru", () => ({
  makeZiruClient: mocks.makeZiruClient,
}))

vi.mock("./source-reconcile-workflow", () => ({
  pollSourceReconciliation: mocks.pollSourceReconciliation,
  markSourceReadyAfterReconciliation: mocks.markSourceReadyAfterReconciliation,
}))

describe("startBackgroundReconciliation", () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    delete process.env.QSTASH_TOKEN
    delete process.env.WEBUI_PUBLIC_URL
    vi.resetModules()
  })

  it("deduplicates workflow triggers only within a bounded cooldown", async () => {
    const triggerCooldownMs: number = 5 * 60_000
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-30T00:00:00.000Z"))
    process.env.QSTASH_TOKEN = "qstash_token"
    process.env.WEBUI_PUBLIC_URL = "https://webui.example"
    mocks.trigger.mockResolvedValue({})

    const { startBackgroundReconciliation } = await import(
      "./background-reconcile"
    )

    await startBackgroundReconciliation(
      "workspace_1",
      "source_1",
      "ziru_key",
    )
    await startBackgroundReconciliation(
      "workspace_1",
      "source_1",
      "ziru_key",
    )

    expect(mocks.trigger).toHaveBeenCalledTimes(1)
    expect(mocks.trigger).toHaveBeenLastCalledWith({
      url: "https://webui.example/api/sources/reconcile",
      body: {
        workspaceId: "workspace_1",
        sourceId: "source_1",
        apiKey: "ziru_key",
      },
      workflowRunId: `source_1-${Math.floor(
        new Date("2026-06-30T00:00:00.000Z").getTime() / triggerCooldownMs,
      )}`,
      retries: 3,
    })

    vi.setSystemTime(new Date("2026-06-30T00:05:01.000Z"))
    await startBackgroundReconciliation(
      "workspace_1",
      "source_1",
      "ziru_key",
    )

    expect(mocks.trigger).toHaveBeenCalledTimes(2)
    expect(mocks.trigger).toHaveBeenLastCalledWith({
      url: "https://webui.example/api/sources/reconcile",
      body: {
        workspaceId: "workspace_1",
        sourceId: "source_1",
        apiKey: "ziru_key",
      },
      workflowRunId: `source_1-${Math.floor(
        new Date("2026-06-30T00:05:01.000Z").getTime() / triggerCooldownMs,
      )}`,
      retries: 3,
    })
  })

  it("polls locally and marks the source ready when QStash is not configured", async () => {
    vi.useFakeTimers()
    mocks.makeZiruClient.mockReturnValue({ client: "client_1" })
    mocks.pollSourceReconciliation.mockResolvedValueOnce({
      kind: "waiting",
      jobId: "job_1",
      jobStatus: "processing",
    })
    mocks.pollSourceReconciliation.mockResolvedValueOnce({
      kind: "ready-to-prepare",
      jobId: "job_1",
      documentId: "doc_1",
    })
    mocks.markSourceReadyAfterReconciliation.mockResolvedValue({
      status: "ready",
    })

    const { startBackgroundReconciliation } = await import(
      "./background-reconcile"
    )

    await startBackgroundReconciliation(
      "workspace_1",
      "source_1",
      "ziru_key",
    )

    // First attempt runs immediately (waiting), then the poll loop waits
    // before the next attempt.
    expect(mocks.pollSourceReconciliation).toHaveBeenCalledTimes(1)
    expect(mocks.makeZiruClient).toHaveBeenCalledWith("ziru_key")
    expect(mocks.trigger).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(3_000)

    expect(mocks.pollSourceReconciliation).toHaveBeenCalledTimes(2)
    expect(mocks.markSourceReadyAfterReconciliation).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      sourceId: "source_1",
      documentId: "doc_1",
    })
  })

  it("does not start a duplicate local poller for the same source", async () => {
    vi.useFakeTimers()
    mocks.makeZiruClient.mockReturnValue({ client: "client_1" })
    mocks.pollSourceReconciliation.mockResolvedValue({
      kind: "waiting",
      jobId: "job_1",
      jobStatus: "processing",
    })

    const { startBackgroundReconciliation } = await import(
      "./background-reconcile"
    )

    await startBackgroundReconciliation(
      "workspace_1",
      "source_1",
      "ziru_key",
    )
    await startBackgroundReconciliation(
      "workspace_1",
      "source_1",
      "ziru_key",
    )

    expect(mocks.pollSourceReconciliation).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(3_000)
    expect(mocks.pollSourceReconciliation).toHaveBeenCalledTimes(2)
  })
})
