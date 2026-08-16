import "server-only"

import { readFile, stat } from "node:fs/promises"

export type ZiruKey = {
  readonly label: string
  readonly apiKey: string
}

export type MaskedZiruKey = {
  readonly label: string
  readonly mask: string
}

/**
 * Source of Ziru API keys (server-side only).
 *
 * Priority:
 * 1. `config/ziru-keys.json` (path from `ZIRU_KEYS_FILE`, default
 *    `./config/ziru-keys.json`) — an array of `{ label, apiKey }`.
 *    Re-read when the file mtime changes, so edits take effect without a
 *    restart.
 * 2. Fallback: the `ZIRU_API_KEY` env var as a single key labeled
 *    `"default"` (bootstrap for fresh deployments before UI-managed DB
 *    keys are added).
 *
 * The edge proxy only checks the session cookie; server code resolves
 * credentials through this module or the DB-backed
 * `ziru-api-keys-repository`.
 */
const defaultKeysFilePath = "./config/ziru-keys.json"

let cachedFileKeys: readonly ZiruKey[] | null = null
let cachedFileMtimeMs: number | null = null

async function readKeysFile(): Promise<readonly ZiruKey[]> {
  const path = process.env.ZIRU_KEYS_FILE?.trim() || defaultKeysFilePath

  try {
    const fileStat = await stat(path)
    if (cachedFileMtimeMs === fileStat.mtimeMs && cachedFileKeys !== null) {
      return cachedFileKeys
    }

    const raw = await readFile(path, "utf8")
    const keys = normalizeFileKeys(JSON.parse(raw))
    cachedFileMtimeMs = fileStat.mtimeMs
    cachedFileKeys = keys
    return keys
  } catch {
    return []
  }
}

function normalizeFileKeys(value: unknown): readonly ZiruKey[] {
  if (!Array.isArray(value)) return []
  const keys: ZiruKey[] = []
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue
    const candidate = entry as Record<string, unknown>
    const label = typeof candidate.label === "string" ? candidate.label.trim() : ""
    const apiKey =
      typeof candidate.apiKey === "string" ? candidate.apiKey.trim() : ""
    if (label.length === 0 || apiKey.length === 0) continue
    keys.push({ label, apiKey })
  }
  return keys
}

function getEnvKey(): ZiruKey | null {
  const value = process.env.ZIRU_API_KEY?.trim()
  if (!value || value.length === 0) return null
  return { label: "default", apiKey: value }
}

export async function listZiruKeys(): Promise<readonly ZiruKey[]> {
  const fileKeys = await readKeysFile()
  if (fileKeys.length > 0) return fileKeys

  const envKey = getEnvKey()
  return envKey ? [envKey] : []
}

export async function listMaskedZiruKeys(): Promise<
  readonly MaskedZiruKey[]
> {
  const keys = await listZiruKeys()
  return keys.map((key) => ({ label: key.label, mask: maskApiKey(key.apiKey) }))
}

export async function getZiruKeyByLabel(
  label: string,
): Promise<ZiruKey | null> {
  const normalized = label?.trim()
  if (!normalized) return null
  const keys = await listZiruKeys()
  return keys.find((candidate) => candidate.label === normalized) ?? null
}

export async function getDefaultZiruKeyLabel(): Promise<string> {
  const keys = await listZiruKeys()
  return keys[0]?.label ?? "default"
}

export async function getDefaultZiruKey(): Promise<ZiruKey | null> {
  const keys = await listZiruKeys()
  return keys[0] ?? null
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 12) return `${apiKey.slice(0, 4)}••••`
  return `${apiKey.slice(0, 6)}••••${apiKey.slice(-4)}`
}
