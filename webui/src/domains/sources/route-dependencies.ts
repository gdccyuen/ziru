import "server-only"

import { del } from "@vercel/blob"

import {
  loadChunkPageForSource,
  loadChunksForSource,
} from "@/domains/chunks/server"
import { ensureApiKeyForWorkspace } from "@/integrations/ziru-credentials"
import { makeZiruClient as makeDefaultZiruClient } from "@/integrations/ziru"
import { getCurrentUser, requireUser } from "@/infrastructure/auth"
import { workspaceService } from "@/domains/workspace/service"
import { workspaceRepository } from "@/domains/workspace/repository"
import { databaseRuntime } from "@/domains/workspace/database-runtime"
import { sourceViewOptionsBySourceId as getDefaultSourceViewOptionsBySourceId } from "./counts"
import { reconcileSourcesForWorkspace as reconcileDefaultSourcesForWorkspace } from "./reconcile"
import { sourceWorkflowRuntime } from "./workflow-runtime"
import { sourceService as defaultSourceService } from "./service"
import type {
  SourceRouteZiruClient,
  SourceRouteServiceDependencies,
  SourceRouteServiceOverrides,
} from "./route-types"

const defaultDependencies: SourceRouteServiceDependencies = {
  deleteBlob: del,
  ensureApiKeyForWorkspace,
  ensureWorkspace: workspaceService.ensureWorkspace,
  findWorkspaceByIdAndUserId: (workspaceId, userId) =>
    databaseRuntime.runPromise(
      workspaceRepository.findByIdAndUserIdEffect(workspaceId, userId),
    ),
  getCurrentUser,
  getSourceViewOptionsBySourceId: (sources, client) =>
    getDefaultSourceViewOptionsBySourceId(
      sources,
      client as ReturnType<typeof makeDefaultZiruClient>,
    ),
  loadChunkPageForSource,
  loadChunksForSource,
  makeZiruClient: (apiKey: string) =>
    makeDefaultZiruClient(apiKey) as SourceRouteZiruClient,
  listSourcesForWorkspace: sourceWorkflowRuntime.listForWorkspace,
  reconcileSourcesForWorkspace: (workspace, client) =>
    reconcileDefaultSourcesForWorkspace(
      workspace,
      client as ReturnType<typeof makeDefaultZiruClient>,
    ),
  requireUser,
  sourceService: {
    findInWorkspace: defaultSourceService.findInWorkspace,
    getParseAssetUrls: defaultSourceService.getParseAssetUrls,
    localizeRemoteDocument: defaultSourceService.localizeRemoteDocument,
    updateSourceRevisionKey: defaultSourceService.updateSourceRevisionKey,
    softDelete: defaultSourceService.softDelete,
    retrySourceToZiru: defaultSourceService.retrySourceToZiru,
    uploadSourceBlobToZiru: defaultSourceService.uploadSourceBlobToZiru,
    uploadSourceToZiru: defaultSourceService.uploadSourceToZiru,
  },
}

function createSourceRouteDependencies(
  overrides: SourceRouteServiceOverrides,
): SourceRouteServiceDependencies {
  return {
    ...defaultDependencies,
    ...overrides,
    sourceService: {
      ...defaultDependencies.sourceService,
      ...overrides.sourceService,
    },
  }
}

async function getClientForWorkspace(
  workspaceId: string,
  cookieHeader: string,
  deps: Pick<
    SourceRouteServiceDependencies,
    "ensureApiKeyForWorkspace" | "makeZiruClient"
  >,
): Promise<SourceRouteZiruClient> {
  const apiKey = await deps.ensureApiKeyForWorkspace(workspaceId)
  return deps.makeZiruClient(apiKey)
}

export { createSourceRouteDependencies, getClientForWorkspace }
