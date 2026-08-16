import "server-only"

import { Effect } from "effect"
import type { JobResult } from "@/integrations/ziru-sdk-types"

import type { Source } from "@/infrastructure/db/schema"
import { logger } from "@/lib/logger"

type SourceLifecycleRepository = {
  markSourceReady(
    workspaceId: string,
    sourceId: string,
    documentId: string,
  ): Promise<unknown>
  markSourceFailed(
    workspaceId: string,
    sourceId: string,
    reason: string,
    requiredStatus?: string,
  ): Promise<unknown>
  clearSourceStagedBlob(workspaceId: string, sourceId: string): Promise<unknown>
}

type SourceLifecycleBlobStore = {
  deleteStagedSourceBlob(pathname: string): Promise<void>
}

type ApplyZiruJobToSourceInput = {
  workspaceId: string
  source: Source
  job: JobResult
  repository: SourceLifecycleRepository
  blobStore: SourceLifecycleBlobStore
}

// ---------------------------------------------------------------------------
// Effect core
// ---------------------------------------------------------------------------

export const applyZiruJobToSourceEffect = Effect.fn(
  "applyZiruJobToSource",
)(
  function* ({
    workspaceId,
    source,
    job,
    repository,
    blobStore,
  }: ApplyZiruJobToSourceInput) {
    // Best-effort early exit: skip duplicate status transitions when the source
    // has already been resolved. The atomic guard is in the DB UPDATE below.
    if (source.status !== "parsing") return

    if (job.isDone || job.status === "done") {
      if (job.documentId) {
        logger.info("lifecycle: job done — transitioning source to ready", {
          sourceId: source.id,
          jobId: source.ziruJobId ?? "",
          documentId: job.documentId,
        })
        yield* Effect.tryPromise(() =>
          repository.markSourceReady(workspaceId, source.id, job.documentId!),
        )
        yield* cleanupStagedBlobEffect(
          workspaceId,
          source,
          repository,
          blobStore,
        )
        logger.info("lifecycle: source transitioned to ready", {
          sourceId: source.id,
          documentId: job.documentId,
        })
        return
      }

      logger.warn("lifecycle: job done but no documentId — marking failed", {
        sourceId: source.id,
        jobId: source.ziruJobId ?? "",
      })
      yield* Effect.tryPromise(() =>
        repository.markSourceFailed(
          workspaceId,
          source.id,
          "Parsing finished but no document was published.",
          "parsing",
        ),
      )
      yield* cleanupStagedBlobEffect(workspaceId, source, repository, blobStore)
      return
    }

    if (job.isFailed || job.status === "failed") {
      logger.warn("lifecycle: job failed — marking source failed", {
        sourceId: source.id,
        jobId: source.ziruJobId ?? "",
        error: job.error?.message ?? "unknown",
      })
      yield* Effect.tryPromise(() =>
        repository.markSourceFailed(
          workspaceId,
          source.id,
          job.error?.message ?? "Parsing failed.",
          "parsing",
        ),
      )
      yield* cleanupStagedBlobEffect(workspaceId, source, repository, blobStore)
      return
    }

    logger.info("lifecycle: job still in progress", {
      sourceId: source.id,
      jobId: source.ziruJobId ?? "",
      jobStatus: job.status,
    })
  },
)

// ---------------------------------------------------------------------------
// Async wrapper (backward-compatible)
// ---------------------------------------------------------------------------

export async function applyZiruJobToSource({
  workspaceId,
  source,
  job,
  repository,
  blobStore,
}: ApplyZiruJobToSourceInput): Promise<void> {
  return Effect.runPromise(
    applyZiruJobToSourceEffect({
      workspaceId,
      source,
      job,
      repository,
      blobStore,
    }),
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanupStagedBlobEffect(
  workspaceId: string,
  source: Source,
  repository: SourceLifecycleRepository,
  blobStore: SourceLifecycleBlobStore,
): Effect.Effect<void> {
  if (!source.stagedBlobPathname) return Effect.void

  return Effect.gen(function* () {
    yield* Effect.tryPromise(() =>
      blobStore.deleteStagedSourceBlob(source.stagedBlobPathname!),
    )
    yield* Effect.tryPromise(() =>
      repository.clearSourceStagedBlob(workspaceId, source.id),
    )
  }).pipe(
    Effect.catchAllCause(() => Effect.void),
  )
}
