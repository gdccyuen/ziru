import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"

import type { Source, Workspace } from "@/infrastructure/db/schema"
import type { UploadJobResult } from "./source-upload-contracts"
import { retrySourceToZiruEffect } from "./retry"

const workspace: Workspace = {
  id: "workspace_1",
  userId: "user_1",
  activeZiruApiKeyId: null,
  namespace: "webui-workspace_1",
  createdAt: new Date("2026-05-10T00:00:00Z"),
}

describe("retrySourceToZiruEffect", () => {
  it("creates a new URL parse job from the saved original Blob", async () => {
    const failedSource = makeSource()
    const parsingSource = makeSource({
      status: "parsing",
      failureReason: null,
      ziruJobId: "job_retry",
      ziruDocumentId: "doc_retry",
    })
    const retryJob: UploadJobResult = {
      jobId: "job_retry",
      status: "pending",
      sourceType: "url",
      documentId: "doc_retry",
      createdAt: new Date("2026-05-10T00:00:00Z"),
    }
    const deps = {
      repository: {
        markSourceFailed: vi.fn(),
        markSourceParsing: vi.fn(async () => parsingSource),
      },
      ziru: {
        jobs: {
          create: vi.fn(async () => retryJob),
          get: vi.fn(),
          upload: vi.fn(),
        },
      },
    }

    const result = await Effect.runPromise(
      retrySourceToZiruEffect(workspace, failedSource, deps),
    )

    expect(deps.ziru.jobs.create).toHaveBeenCalledWith({
      sourceType: "url",
      sourceUrl:
        "https://store.public.blob.vercel-storage.com/source-uploads/upload_1/document.pdf",
      fileName: "notes.pdf",
      namespace: "webui-workspace_1",
      documentMetadata: {
        createdByClient: "webui",
        sourceFileName: "notes.pdf",
        title: "notes.pdf",
        mimeType: "application/pdf",
        sizeBytes: 5,
      },
    })
    expect(deps.repository.markSourceParsing).toHaveBeenCalledWith(
      workspace.id,
      failedSource.id,
      "job_retry",
      "doc_retry",
      "failed",
    )
    expect(result).toBe(parsingSource)
  })

  it("keeps the source failed with a brief retry error when Ziru rejects the job", async () => {
    const failedSource = makeSource()
    const updatedFailedSource = makeSource({
      failureReason:
        "Too many concurrent requests (2/2 active). Please retry after 30 seconds.",
    })
    const deps = {
      repository: {
        markSourceFailed: vi.fn(async () => updatedFailedSource),
        markSourceParsing: vi.fn(),
      },
      ziru: {
        jobs: {
          create: vi.fn(async () => {
            throw Object.assign(new Error("Rate limited."), {
              body: {
                error: {
                  message:
                    "Too many concurrent requests (2/2 active). Please retry after 30 seconds.",
                },
              },
            })
          }),
          get: vi.fn(),
          upload: vi.fn(),
        },
      },
    }

    const result = await Effect.runPromise(
      retrySourceToZiruEffect(workspace, failedSource, deps),
    )

    expect(result).toBe(updatedFailedSource)
    expect(deps.repository.markSourceParsing).not.toHaveBeenCalled()
    expect(deps.repository.markSourceFailed).toHaveBeenCalledWith(
      workspace.id,
      failedSource.id,
      "Too many concurrent requests (2/2 active). Please retry after 30 seconds.",
      "failed",
    )
  })
})

function makeSource(overrides: Partial<Source> = {}): Source {
  return {
    id: "source_1",
    workspaceId: workspace.id,
    title: "notes.pdf",
    mimeType: "application/pdf",
    sizeBytes: 5,
    status: "failed",
    failureReason: "Ziru upload failed.",
    ziruJobId: null,
    ziruDocumentId: null,
    stagedBlobPathname: null,
    stagedBlobUrl: null,
    originalBlobPathname: "source-uploads/upload_1/document.pdf",
    originalBlobUrl:
      "https://store.public.blob.vercel-storage.com/source-uploads/upload_1/document.pdf",
    createdAt: new Date("2026-05-10T00:00:00Z"),
    updatedAt: new Date("2026-05-10T00:00:00Z"),
    deletedAt: null,
    ...overrides,
  }
}
