import "server-only"

import { Effect } from "effect"

import { ensureApiKeyForWorkspace } from "@/integrations/ziru-credentials"
import {
  getCurrentUser as getCurrentUserFromAuth,
  requireUser,
  type AuthUser,
} from "@/infrastructure/auth"
import { makeZiruClient } from "@/integrations/ziru"
import { workspaceService } from "@/domains/workspace/service"
import type { Workspace } from "@/infrastructure/db/schema"

type WebUIClient = ReturnType<typeof makeZiruClient>

type AuthenticatedWebUIContext = {
  readonly user: AuthUser
  readonly workspace: Workspace
}

type AuthenticatedWebUIClientContext = AuthenticatedWebUIContext & {
  readonly apiKey: string
  readonly client: WebUIClient
}

// ---------------------------------------------------------------------------
// Effect core
// ---------------------------------------------------------------------------

const getAuthenticatedEffect = Effect.gen(function* () {
    const user = yield* Effect.tryPromise(() => requireUser())
    const workspace = yield* Effect.tryPromise(() =>
      workspaceService.ensureWorkspace(user.id),
    )
    if (!workspace) {
      return yield* Effect.die(
        new Error(
          "No workspace for this user. The user must add an API key and " +
            "pick a namespace first.",
        ),
      )
    }

    return { user, workspace }
  })

const getOptionalAuthenticatedEffect = Effect.gen(function* () {
    const user = yield* Effect.tryPromise(() => getCurrentUserFromAuth())
    if (!user) return null

    const workspace = yield* Effect.tryPromise(() =>
      workspaceService.ensureWorkspace(user.id),
    )
    if (!workspace) return null

    return { user, workspace }
  })

const getAuthenticatedWithClientEffect = Effect.gen(function* () {
    const context = yield* getAuthenticatedEffect
    const clientContext = yield* getClientForWorkspaceEffect(context.workspace)

    return {
      ...context,
      ...clientContext,
    }
  })

const getClientForWorkspaceEffect = (workspace: Workspace) =>
  Effect.gen(function* () {
    const apiKey = yield* Effect.tryPromise(() =>
      ensureApiKeyForWorkspace(workspace.id),
    )
    const client = makeZiruClient(apiKey)

    return { apiKey, client }
  })

// ---------------------------------------------------------------------------
// Async wrappers (backward-compatible)
// ---------------------------------------------------------------------------

async function getAuthenticated(): Promise<AuthenticatedWebUIContext> {
  return Effect.runPromise(getAuthenticatedEffect)
}

async function getCurrentUser(): Promise<AuthUser | null> {
  return Effect.runPromise(Effect.tryPromise(() => getCurrentUserFromAuth()))
}

async function getOptionalAuthenticated(): Promise<AuthenticatedWebUIContext | null> {
  return Effect.runPromise(getOptionalAuthenticatedEffect)
}

async function getAuthenticatedWithClient(): Promise<AuthenticatedWebUIClientContext> {
  return Effect.runPromise(getAuthenticatedWithClientEffect)
}

async function getClientForWorkspace(
  workspace: Workspace,
): Promise<Pick<AuthenticatedWebUIClientContext, "apiKey" | "client">> {
  return Effect.runPromise(getClientForWorkspaceEffect(workspace))
}

export const webuiRequestContext = {
  getAuthenticated,
  getCurrentUser,
  getOptionalAuthenticated,
  getAuthenticatedWithClient,
  getClientForWorkspace,
} as const
