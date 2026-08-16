import "server-only"

import { Effect } from "effect"

import type { Source, Workspace } from "@/infrastructure/db/schema"
import type { SourceBlobUploadInput } from "./blob-upload"
import {
  type UploadZiruClient,
  uploadSourceBlobToZiruEffect,
  uploadSourceToZiruEffect,
} from "./upload"
import { retrySourceToZiruEffect } from "./retry"
import { sourceWorkflowRuntime } from "./workflow-runtime"

type SourceService = {
  readonly findInWorkspace: (
    workspaceId: string,
    sourceId: string,
  ) => Promise<Source | null>
  readonly getParseAssetUrls: (
    workspaceId: string,
    sourceId: string,
  ) => Promise<Readonly<Record<string, string>>>
  readonly listForWorkspace: (workspaceId: string) => Promise<Source[]>
  readonly localizeRemoteDocument: (
    workspaceId: string,
    input: Parameters<typeof sourceWorkflowRuntime.localizeRemoteDocument>[1],
  ) => Promise<Source>
  readonly updateSourceRevisionKey: (
    workspaceId: string,
    sourceId: string,
    revisionKey: string,
  ) => Promise<Source | null>
  readonly softDelete: (
    workspaceId: string,
    sourceId: string,
  ) => Promise<boolean>
  readonly uploadSourceToZiru: (
    workspace: Workspace,
    file: File,
    ziru: UploadZiruClient,
  ) => Promise<Source>
  readonly uploadSourceBlobToZiru: (
    workspace: Workspace,
    input: SourceBlobUploadInput,
    ziru: UploadZiruClient,
  ) => Promise<Source>
  readonly retrySourceToZiru: (
    workspace: Workspace,
    source: Source,
    ziru: UploadZiruClient,
  ) => Promise<Source>
}

const uploadSourceToZiru: SourceService["uploadSourceToZiru"] = (
  workspace: Workspace,
  file: File,
  ziru: UploadZiruClient,
) =>
  Effect.runPromise(
    uploadSourceToZiruEffect(workspace, file, {
      repository: sourceWorkflowRuntime.createUploadRepository(),
      ziru,
    }),
  )

const uploadSourceBlobToZiru: SourceService["uploadSourceBlobToZiru"] =
  (
    workspace: Workspace,
    input: SourceBlobUploadInput,
    ziru: UploadZiruClient,
  ) =>
    Effect.runPromise(
      uploadSourceBlobToZiruEffect(workspace, input, {
        repository: sourceWorkflowRuntime.createUploadRepository(),
        ziru,
      }),
    )

const retrySourceToZiru: SourceService["retrySourceToZiru"] = (
  workspace: Workspace,
  source: Source,
  ziru: UploadZiruClient,
) =>
  Effect.runPromise(
    retrySourceToZiruEffect(workspace, source, {
      repository: {
        markSourceFailed: sourceWorkflowRuntime.markFailed,
        markSourceParsing: sourceWorkflowRuntime.markParsing,
      },
      ziru,
    }),
  )

export const sourceService: SourceService = {
  findInWorkspace: sourceWorkflowRuntime.findInWorkspace,
  getParseAssetUrls: sourceWorkflowRuntime.getParseAssetUrls,
  listForWorkspace: sourceWorkflowRuntime.listForWorkspace,
  localizeRemoteDocument: sourceWorkflowRuntime.localizeRemoteDocument,
  updateSourceRevisionKey: sourceWorkflowRuntime.updateRevisionKey,
  softDelete: sourceWorkflowRuntime.softDelete,
  uploadSourceToZiru,
  uploadSourceBlobToZiru,
  retrySourceToZiru,
}
