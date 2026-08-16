import "server-only"

import { and, eq, isNull } from "drizzle-orm"
import { Effect } from "effect"

import { DbClient } from "@/infrastructure/db"
import {
  ziruApiKeys,
  workspaces,
  type ZiruApiKey,
} from "@/infrastructure/db/schema"
import { decryptSecret, encryptSecret } from "@/lib/secret-crypto"
import { maskApiKey } from "@/integrations/ziru-keys"

export type StoredZiruApiKey = {
  readonly id: string
  readonly userId: string
  readonly label: string
  readonly keyMask: string
  readonly createdAt: Date
}

type ZiruApiKeysRepository = {
  readonly createForUserEffect: (input: {
    readonly userId: string
    readonly label: string
    readonly apiKey: string
  }) => Effect.Effect<ZiruApiKey, never, DbClient>
  readonly listByUserEffect: (
    userId: string,
  ) => Effect.Effect<StoredZiruApiKey[], never, DbClient>
  readonly findByIdAndUserEffect: (
    id: string,
    userId: string,
  ) => Effect.Effect<StoredZiruApiKey | null, never, DbClient>
  readonly softDeleteEffect: (
    id: string,
    userId: string,
  ) => Effect.Effect<void, never, DbClient>
  readonly getActiveForWorkspaceEffect: (
    workspaceId: string,
  ) => Effect.Effect<StoredZiruApiKey | null, never, DbClient>
  readonly firstForUserEffect: (
    userId: string,
  ) => Effect.Effect<StoredZiruApiKey | null, never, DbClient>
  readonly setActiveEffect: (
    workspaceId: string,
    apiKeyId: string | null,
  ) => Effect.Effect<void, never, DbClient>
  readonly clearActiveForKeyEffect: (
    apiKeyId: string,
    userId: string,
  ) => Effect.Effect<void, never, DbClient>
  readonly decryptStoredEffect: (
    stored: StoredZiruApiKey,
  ) => Effect.Effect<string, never, DbClient>
}

const toStored = (row: ZiruApiKey): StoredZiruApiKey => ({
  id: row.id,
  userId: row.userId,
  label: row.label,
  keyMask: row.keyMask,
  createdAt: row.createdAt,
})

const createForUserEffect: ZiruApiKeysRepository["createForUserEffect"] = (
  input,
) =>
  Effect.gen(function* () {
    const db = yield* DbClient
    const encrypted = encryptSecret(input.apiKey)
    const rows = yield* Effect.promise(() =>
      db
        .insert(ziruApiKeys)
        .values({
          userId: input.userId,
          label: input.label,
          keyMask: maskApiKey(input.apiKey),
          cipherBlob: encrypted.cipherText,
          cipherNonce: encrypted.nonce,
        })
        .returning(),
    )
    const row = rows[0]
    if (!row) {
      return yield* Effect.die(
        new Error("ziru_api_keys: insert returned no row."),
      )
    }
    return row
  })

const listByUserEffect: ZiruApiKeysRepository["listByUserEffect"] = (
  userId: string,
) =>
  Effect.gen(function* () {
    const db = yield* DbClient
    const rows = yield* Effect.promise(() =>
      db
        .select()
        .from(ziruApiKeys)
        .where(
          and(
            eq(ziruApiKeys.userId, userId),
            isNull(ziruApiKeys.deletedAt),
          ),
        )
        .orderBy(ziruApiKeys.createdAt),
    )
    return rows.map(toStored)
  })

const findByIdAndUserEffect: ZiruApiKeysRepository["findByIdAndUserEffect"] =
  (id: string, userId: string) =>
    Effect.gen(function* () {
      const db = yield* DbClient
      const rows = yield* Effect.promise(() =>
        db
          .select()
          .from(ziruApiKeys)
          .where(
            and(
              eq(ziruApiKeys.id, id),
              eq(ziruApiKeys.userId, userId),
              isNull(ziruApiKeys.deletedAt),
            ),
          )
          .limit(1),
      )
      return rows[0] ? toStored(rows[0]) : null
    })

const softDeleteEffect: ZiruApiKeysRepository["softDeleteEffect"] = (
  id: string,
  userId: string,
) =>
  Effect.gen(function* () {
    const db = yield* DbClient
    yield* Effect.promise(() =>
      db
        .update(ziruApiKeys)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(ziruApiKeys.id, id),
            eq(ziruApiKeys.userId, userId),
          ),
        ),
    )
  })

const getActiveForWorkspaceEffect: ZiruApiKeysRepository["getActiveForWorkspaceEffect"] =
  (workspaceId: string) =>
    Effect.gen(function* () {
      const db = yield* DbClient
      const workspaceRows = yield* Effect.promise(() =>
        db
          .select({ activeZiruApiKeyId: workspaces.activeZiruApiKeyId })
          .from(workspaces)
          .where(eq(workspaces.id, workspaceId))
          .limit(1),
      )
      const activeId = workspaceRows[0]?.activeZiruApiKeyId
      if (!activeId) return null

      const rows = yield* Effect.promise(() =>
        db
          .select()
          .from(ziruApiKeys)
          .where(
            and(
              eq(ziruApiKeys.id, activeId),
              isNull(ziruApiKeys.deletedAt),
            ),
          )
          .limit(1),
      )
      return rows[0] ? toStored(rows[0]) : null
    })

const firstForUserEffect: ZiruApiKeysRepository["firstForUserEffect"] = (
  userId: string,
) =>
  Effect.gen(function* () {
    const db = yield* DbClient
    const rows = yield* Effect.promise(() =>
      db
        .select()
        .from(ziruApiKeys)
        .where(
          and(
            eq(ziruApiKeys.userId, userId),
            isNull(ziruApiKeys.deletedAt),
          ),
        )
        .orderBy(ziruApiKeys.createdAt)
        .limit(1),
    )
    return rows[0] ? toStored(rows[0]) : null
  })

const setActiveEffect: ZiruApiKeysRepository["setActiveEffect"] = (
  workspaceId: string,
  apiKeyId: string | null,
) =>
  Effect.gen(function* () {
    const db = yield* DbClient
    yield* Effect.promise(() =>
      db
        .update(workspaces)
        .set({ activeZiruApiKeyId: apiKeyId })
        .where(eq(workspaces.id, workspaceId)),
    )
  })

const clearActiveForKeyEffect: ZiruApiKeysRepository["clearActiveForKeyEffect"] =
  (apiKeyId: string, userId: string) =>
    Effect.gen(function* () {
      const db = yield* DbClient
      yield* Effect.promise(() =>
        db
          .update(workspaces)
          .set({ activeZiruApiKeyId: null })
          .where(
            and(
              eq(workspaces.userId, userId),
              eq(workspaces.activeZiruApiKeyId, apiKeyId),
            ),
          ),
      )
    })

const decryptStoredEffect: ZiruApiKeysRepository["decryptStoredEffect"] = (
  stored: StoredZiruApiKey,
) =>
  Effect.gen(function* () {
    const db = yield* DbClient
    const rows = yield* Effect.promise(() =>
      db
        .select()
        .from(ziruApiKeys)
        .where(eq(ziruApiKeys.id, stored.id))
        .limit(1),
    )
    const row = rows[0]
    if (!row) {
      return yield* Effect.die(
        new Error("ziru_api_keys: row not found for decrypt."),
      )
    }
    return decryptSecret({
      cipherText: row.cipherBlob,
      nonce: row.cipherNonce,
    })
  })

export const ziruApiKeysRepository: ZiruApiKeysRepository = {
  createForUserEffect,
  listByUserEffect,
  findByIdAndUserEffect,
  softDeleteEffect,
  getActiveForWorkspaceEffect,
  firstForUserEffect,
  setActiveEffect,
  clearActiveForKeyEffect,
  decryptStoredEffect,
}
